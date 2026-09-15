from collections import defaultdict
import json
import os
from pathlib import Path
import time
import mysql.connector
import numpy as np
from ev_statistics import empirical_quantiles
from config import AUDIT_ENABLED, AUDIT_OUTPUT_DIR, DB_CONFIG, QUICK_TEST_SET
from price_resolver import PriceResolver


def convert_time(seconds: float) -> str:
  m, s = divmod(int(seconds), 60)
  h, m = divmod(m, 60)
  return f'{h:02d}:{m:02d}:{s:02d}'


# Ignored non-card sheets (Tokens, Art cards, Ads, Punch cards, Dungeons)
IGNORED_SHEET_KEYWORDS = (
    'token',
    'art',
    'ad',
    'marketing',
    'minigame',
    'punch',
    'dungeon',
    'substitute',
    'tip',
    'checklist',
)

# Only these named vendors may become a per-vendor booster_ev_results row.
# Any other provider string discovered from AllPricesToday (typos, aggregate
# or reserved labels such as "all") must never be treated as a real seller.
NAMED_VENDORS = {'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'}

COLLATION_OVERRIDE_PATH = (
  Path(__file__).resolve().parents[1]
  / 'public'
  / 'data'
  / 'booster_collation_overrides.json'
)


def is_ignored_sheet(sheet_name: str) -> bool:
  s_lower = sheet_name.lower()
  return any(kw in s_lower for kw in IGNORED_SHEET_KEYWORDS)


class DatabaseBoosterEVEngine:

  def __init__(self, db_config, sample_size=5000, hi_lo_ratio=0.05, audit_config=None):
    self.db_config = db_config
    self.sample_size = sample_size
    self.hi_lo_ratio = hi_lo_ratio
    self.trim_count = max(1, int(sample_size * hi_lo_ratio))
    self.audit_config = audit_config

    self.card_cache = {}
    self.price_cache = {}
    self.lowest_cache = {}
    self.collation_overrides = self._load_collation_overrides()
    self.price_resolver = PriceResolver(
      self.card_cache, self.price_cache, self.lowest_cache
    )

    self.conn = mysql.connector.connect(**self.db_config)
    self.cursor = self.conn.cursor(dictionary=True)

    self._init_database_schema()

  @staticmethod
  def _load_collation_overrides():
    if not COLLATION_OVERRIDE_PATH.exists():
      return {}
    try:
      with COLLATION_OVERRIDE_PATH.open('r', encoding='utf-8') as handle:
        document = json.load(handle)
      return document.get('entries', {})
    except (OSError, json.JSONDecodeError) as exc:
      print(f'   -> Could not load collation overrides: {exc}')
      return {}

  def _sheet_fixed_override(self, set_code: str, booster_name: str, sheet_name: str):
    entry = self.collation_overrides.get(
      f'{set_code.upper()}:{booster_name.lower()}'
    )
    if not entry or not entry.get('fixedByDefault', False):
      return None
    return sheet_name not in set(entry.get('variableSheets', []))

  def _init_database_schema(self):
    """Creates the target MySQL table with indexes for high-speed querying."""
    self.cursor.execute("""
            CREATE TABLE IF NOT EXISTS booster_ev_results (
                id INT AUTO_INCREMENT PRIMARY KEY,
                set_code VARCHAR(8) NOT NULL,
                booster_name VARCHAR(64) NOT NULL,
                price_mode VARCHAR(32) NOT NULL,
                vendor VARCHAR(32) NOT NULL,
                
                ev_average DECIMAL(10, 2) NOT NULL,
                ev_mid90 DECIMAL(10, 2) NOT NULL,
                ev_min DECIMAL(10, 2) NOT NULL,
                ev_max DECIMAL(10, 2) NOT NULL,
                ev_min5 DECIMAL(10, 2) NOT NULL,
                ev_max5 DECIMAL(10, 2) NOT NULL,
                quantiles JSON DEFAULT NULL,
                
                complete_booster_pct DECIMAL(5, 2),
                exact_match_pct DECIMAL(5, 2),
                different_finish_pct DECIMAL(5, 2),
                different_vendor_pct DECIMAL(5, 2),
                failed_boosters INT DEFAULT 0,
                
                simulated_packs INT DEFAULT 5000,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                
                UNIQUE KEY uq_booster_mode_vendor (set_code, booster_name, price_mode, vendor),
                INDEX idx_set_booster (set_code, booster_name),
                INDEX idx_vendor (vendor),
                INDEX idx_mode (price_mode)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
    self.conn.commit()

  def close(self):
    self.cursor.close()
    self.conn.close()

  # ====================================================
  # 1. BULK PRE-FETCHING METADATA & PRICES
  # ====================================================
  def prefetch_cards(self, card_uuids):
    missing_uuids = [u for u in card_uuids if u not in self.card_cache]
    if not missing_uuids:
      return

    # A. Card metadata
    for i in range(0, len(missing_uuids), 1000):
      batch = missing_uuids[i : i + 1000]
      placeholders = ','.join(['%s'] * len(batch))
      self.cursor.execute(
          f"""
                SELECT uuid, finishes, name, layout, types, isOnlineOnly 
                FROM cards 
                WHERE uuid IN ({placeholders})
            """,
          batch,
      )
      for row in self.cursor.fetchall():
        finishes = [
            f.strip().replace('nonfoil', 'normal').lower()
            for f in (row.get('finishes') or '').split(',')
        ]
        layout = (row.get('layout') or '').lower()
        types = (row.get('types') or '').lower()
        is_token_or_art = (
            layout in ('token', 'art_series', 'double_faced_token', 'emblem')
            or 'token' in types
            or 'card//art' in types
        )

        self.card_cache[row['uuid']] = {
            'name': row.get('name', ''),
            'finishes': finishes,
            'is_online': bool(row.get('isOnlineOnly', 0)),
            'is_ignored': is_token_or_art,
        }

    for u in missing_uuids:
      if u not in self.card_cache:
        self.card_cache[u] = {
            'name': '',
            'finishes': [],
            'is_online': False,
            'is_ignored': False,
        }

    # B. Direct Paper Prices (from prices table)
    for i in range(0, len(missing_uuids), 1000):
      batch = missing_uuids[i : i + 1000]
      placeholders = ','.join(['%s'] * len(batch))
      self.cursor.execute(
          f"""
                SELECT uuid, provider AS seller, finish, price 
                FROM prices 
                WHERE uuid IN ({placeholders}) 
                  AND (source = 'paper' OR source IS NULL)
                  AND (priceType = 'retail' OR priceType IS NULL)
                  AND price > 0
            """,
          batch,
      )
      for row in self.cursor.fetchall():
        u = row['uuid']
        if u not in self.price_cache:
          self.price_cache[u] = defaultdict(dict)
        if row['price'] is not None and row.get('seller') and row.get('finish'):
          f_name = str(row['finish']).strip().replace('nonfoil', 'normal').lower()
          self.price_cache[u][str(row['seller']).lower()][f_name] = float(
              row['price']
          )


    # C. Lowest Reprint Prices (from lowest_prices table)
    names = list(
        {
            self.card_cache[u]['name']
            for u in missing_uuids
            if u in self.card_cache and self.card_cache[u]['name']
        }
    )
    for i in range(0, len(names), 1000):
      batch = names[i : i + 1000]
      placeholders = ','.join(['%s'] * len(batch))
      self.cursor.execute(
          f"""
                SELECT name, seller, cardfinish, price 
                FROM lowest_prices 
                WHERE name IN ({placeholders}) AND price > 0
            """,
          batch,
      )
      for row in self.cursor.fetchall():
        n = row['name']
        if n not in self.lowest_cache:
          self.lowest_cache[n] = {'sellers': defaultdict(dict), 'min_all': None}
        f_name = row['cardfinish'].strip().replace('nonfoil', 'normal').lower()
        self.lowest_cache[n]['sellers'][row['seller'].lower()][f_name] = float(
            row['price']
        )

      # Overall minimum across any seller/finish
      self.cursor.execute(
          f"""
                SELECT name, MIN(price) as min_p 
                FROM lowest_prices 
                WHERE name IN ({placeholders}) AND price > 0
                GROUP BY name
            """,
          batch,
      )
      for row in self.cursor.fetchall():
        if row['name'] in self.lowest_cache and row['min_p'] is not None:
          self.lowest_cache[row['name']]['min_all'] = float(row['min_p'])

  # ====================================================
  # 3. LOAD BOOSTER CONFIG DIRECTLY FROM MYSQL
  # ====================================================
  def load_booster_config_from_db(self, set_code: str, booster_name: str):
    self.cursor.execute(
        """
            SELECT boosterIndex, boosterWeight 
            FROM setBoosterContentWeights 
            WHERE setCode = %s AND boosterName = %s
            ORDER BY boosterIndex
        """,
        (set_code, booster_name),
    )
    weight_rows = self.cursor.fetchall()
    if not weight_rows:
      return None

    booster_weights = {
        row['boosterIndex']: float(row['boosterWeight']) for row in weight_rows
    }

    self.cursor.execute(
        """
            SELECT boosterIndex, sheetName, sheetPicks 
            FROM setBoosterContents 
            WHERE setCode = %s AND boosterName = %s
        """,
        (set_code, booster_name),
    )
    content_rows = self.cursor.fetchall()

    boosters = defaultdict(dict)
    for row in content_rows:
      boosters[row['boosterIndex']][row['sheetName']] = int(row['sheetPicks'])

    boosters_list = [
        {'weight': booster_weights.get(b_idx, 1.0), 'contents': contents}
        for b_idx, contents in boosters.items()
    ]

    self.cursor.execute(
        """
            SELECT sheetName, sheetIsFoil 
            FROM setBoosterSheets 
            WHERE setCode = %s AND boosterName = %s
        """,
        (set_code, booster_name),
    )
    sheet_meta = {
        row['sheetName']: bool(row['sheetIsFoil'])
        for row in self.cursor.fetchall()
    }

    self.cursor.execute(
        """
            SELECT sheetName, cardUuid, cardWeight 
            FROM setBoosterSheetCards 
            WHERE setCode = %s AND boosterName = %s
        """,
        (set_code, booster_name),
    )
    card_rows = self.cursor.fetchall()

    sheets = defaultdict(lambda: {'cards': {}, 'foil': False, 'fixed': False})
    for row in card_rows:
      s_name = row['sheetName']
      sheets[s_name]['cards'][row['cardUuid']] = float(row['cardWeight'])
      sheets[s_name]['foil'] = sheet_meta.get(s_name, False)
      fixed_override = self._sheet_fixed_override(set_code, booster_name, s_name)
      if fixed_override is not None:
        sheets[s_name]['fixed'] = fixed_override

    return {'boosters': boosters_list, 'sheets': dict(sheets)}

  # ====================================================
  # 4. SIMULATION WITH FULL MATRIX CALCULATION
  # ====================================================
  def simulate_and_store(self, set_code: str, booster_name: str):
    config = self.load_booster_config_from_db(set_code, booster_name)
    if not config or not config['boosters'] or not config['sheets']:
      return None

    boosters = config['boosters']
    sheets = config['sheets']

    active_sheets = {
        k: v for k, v in sheets.items() if not is_ignored_sheet(k)
    }
    if not active_sheets:
      return None

    all_uuids = set()
    for s in active_sheets.values():
      all_uuids.update(s['cards'].keys())
    self.prefetch_cards(list(all_uuids))

    sellers = set()
    for u in all_uuids:
      sellers.update(self.price_cache.get(u, {}).keys())
    sellers = sorted(s for s in sellers if s in NAMED_VENDORS)
    if not sellers:
      print(f'   -> No named vendor price data for {set_code} {booster_name}; skipping simulation')
      return None

    # Pre-compile price arrays for all modes & vendors
    sheet_data = {}
    for sheet_name, sheet in active_sheets.items():
      cards = sheet['cards']
      u_list = list(cards.keys())
      if not u_list:
        continue
      w_list = np.array(list(cards.values()), dtype=np.float64)
      total_w = w_list.sum()
      if total_w == 0:
        continue
      w_list /= total_w

      fixed_indices = None
      if sheet.get('fixed', False):
        fixed_counts = np.rint(np.array(list(cards.values()), dtype=np.float64)).astype(int)
        fixed_indices = np.repeat(np.arange(len(u_list)), fixed_counts)
        if len(fixed_indices) == 0:
          fixed_indices = np.arange(len(u_list))

      req_finish = 'foil' if sheet.get('foil', False) else 'normal'

      matrix = {
          'direct': {'all_cheapest': [], 'all_average': [], **{s: [] for s in sellers}},
          'cheapest_reprint': {'all_cheapest': [], 'all_average': [], **{s: [] for s in sellers}},
      }
      status_matrix = {
          'direct': {'all_cheapest': [], 'all_average': [], **{s: [] for s in sellers}},
          'cheapest_reprint': {'all_cheapest': [], 'all_average': [], **{s: [] for s in sellers}},
      }

      for u in u_list:
        # Direct
        p_all_dir, st_all_dir = self.price_resolver.resolve_card_price_global(
            u, req_finish, use_reprints=False
        )
        matrix['direct']['all_cheapest'].append(p_all_dir)
        status_matrix['direct']['all_cheapest'].append(st_all_dir)

        p_avg_dir, st_avg_dir = self.price_resolver.resolve_card_price_average(
          u, req_finish, sellers, use_reprints=False
        )
        matrix['direct']['all_average'].append(p_avg_dir)
        status_matrix['direct']['all_average'].append(st_avg_dir)

        for s in sellers:
          p_v_dir, st_v_dir = self.price_resolver.resolve_card_price(
              u, req_finish, target_vendor=s, use_reprints=False
          )
          matrix['direct'][s].append(p_v_dir)
          status_matrix['direct'][s].append(st_v_dir)

        # Cheapest Reprint
        p_all_rep, st_all_rep = self.price_resolver.resolve_card_price_global(
            u, req_finish, use_reprints=True
        )
        matrix['cheapest_reprint']['all_cheapest'].append(p_all_rep)
        status_matrix['cheapest_reprint']['all_cheapest'].append(st_all_rep)

        p_avg_rep, st_avg_rep = self.price_resolver.resolve_card_price_average(
          u, req_finish, sellers, use_reprints=True
        )
        matrix['cheapest_reprint']['all_average'].append(p_avg_rep)
        status_matrix['cheapest_reprint']['all_average'].append(st_avg_rep)

        for s in sellers:
          p_v_rep, st_v_rep = self.price_resolver.resolve_card_price(
              u, req_finish, target_vendor=s, use_reprints=True
          )
          matrix['cheapest_reprint'][s].append(p_v_rep)
          status_matrix['cheapest_reprint'][s].append(st_v_rep)

      sheet_data[sheet_name] = {
          'uuids': u_list,
          'weights': w_list,
          'fixed': sheet.get('fixed', False),
          'fixed_indices': fixed_indices,
          'matrix': matrix,
          'status': status_matrix,
      }

    # 5,000 Booster Variant Picks
    b_weights = np.array([b['weight'] for b in boosters], dtype=np.float64)
    if b_weights.sum() == 0:
      b_weights = np.ones(len(boosters))
    b_weights /= b_weights.sum()

    chosen_booster_indices = np.random.choice(
        len(boosters), size=self.sample_size, p=b_weights
    )

    all_vendors_list = ['all_cheapest', 'all_average'] + sellers
    modes = ['direct', 'cheapest_reprint']

    valid_packs = {
        mode: {v: [] for v in all_vendors_list} for mode in modes
    }
    telemetry_status = {
        mode: {
            v: {
                'exact': 0,
                'finish_fallback': 0,
                'reprint': 0,
                'vendor_fallback': 0,
                'vendor_finish_fallback': 0,
                'unpriced': 0,
                'ignored': 0,
                'failed_boosters': 0,
                'total_slots': 0,
            }
            for v in all_vendors_list
        }
        for mode in modes
    }

    for b_idx in chosen_booster_indices:
      contents = boosters[b_idx]['contents']

      pack_sums = {
          mode: {v: 0.0 for v in all_vendors_list} for mode in modes
      }
      pack_valid = {
          mode: {v: True for v in all_vendors_list} for mode in modes
      }

      for sheet_name, pick_count in contents.items():
        if sheet_name not in sheet_data or pick_count <= 0:
          continue

        s_info = sheet_data[sheet_name]
        if s_info['fixed']:
          picked_indices = np.resize(s_info['fixed_indices'], pick_count)
        else:
          picked_indices = np.random.choice(
              len(s_info['uuids']), size=pick_count, p=s_info['weights']
          )

        for mode in modes:
          for v in all_vendors_list:
            telemetry_status[mode][v]['total_slots'] += pick_count
            for idx in picked_indices:
              p = s_info['matrix'][mode][v][idx]
              st = s_info['status'][mode][v][idx]
              telemetry_status[mode][v][st] += 1

              if p is None:
                pack_valid[mode][v] = False
              elif pack_valid[mode][v]:
                pack_sums[mode][v] += p

      for mode in modes:
        for v in all_vendors_list:
          if pack_valid[mode][v]:
            valid_packs[mode][v].append(round(pack_sums[mode][v], 2))
          else:
            telemetry_status[mode][v]['failed_boosters'] += 1

    # Insert / Update records into MySQL
    insert_sql = """
            INSERT INTO booster_ev_results 
                (set_code, booster_name, price_mode, vendor, 
                 ev_average, ev_mid90, ev_min, ev_max, ev_min5, ev_max5, quantiles,
                 complete_booster_pct, exact_match_pct, different_finish_pct, different_vendor_pct, 
                 failed_boosters, simulated_packs)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                ev_average = VALUES(ev_average),
                ev_mid90 = VALUES(ev_mid90),
                ev_min = VALUES(ev_min),
                ev_max = VALUES(ev_max),
                ev_min5 = VALUES(ev_min5),
                ev_max5 = VALUES(ev_max5),
                quantiles = VALUES(quantiles),
                complete_booster_pct = VALUES(complete_booster_pct),
                exact_match_pct = VALUES(exact_match_pct),
                different_finish_pct = VALUES(different_finish_pct),
                different_vendor_pct = VALUES(different_vendor_pct),
                failed_boosters = VALUES(failed_boosters),
                simulated_packs = VALUES(simulated_packs),
                updated_at = CURRENT_TIMESTAMP;
        """

    db_rows = []

    # Remove pre-migration aggregate rows so legacy `all` records cannot
    # compete with the canonical all_cheapest rows during export.
    self.cursor.execute(
      "DELETE FROM booster_ev_results WHERE set_code = %s AND booster_name = %s AND vendor = 'all'",
      (set_code, booster_name),
    )

    for mode in modes:
      for v in all_vendors_list:
        arr = valid_packs[mode][v]
        t = telemetry_status[mode][v]
        active_slots = max(1, t['total_slots'] - t['ignored'])

        if arr:
          np_arr = np.array(arr)
          s_arr = np.sort(np_arr)
          
          trim = max(1, int(len(s_arr) * self.hi_lo_ratio))
          mid = s_arr[trim:-trim] if len(s_arr) > trim * 2 else s_arr

          ev_avg = round(float(np.mean(np_arr)), 2)
          ev_mid90 = round(float(np.mean(mid)), 2)
          ev_min = round(float(np.min(np_arr)), 2)
          ev_max = round(float(np.max(np_arr)), 2)
          ev_min5 = round(float(np.mean(s_arr[:trim])), 2)
          ev_max5 = round(float(np.mean(s_arr[-trim:])), 2)

          # Persist buckets derived directly from the simulated pack samples.
          quantiles = empirical_quantiles(s_arr)

          if self._matches_audit(set_code, booster_name, mode, v):
            self._write_audit(set_code, booster_name, mode, v, s_arr.tolist(), quantiles)
        else:
          ev_avg = ev_mid90 = ev_min = ev_max = ev_min5 = ev_max5 = 0.0
          quantiles = []

        complete_pct = round((len(arr) / self.sample_size) * 100, 2)
        exact_pct = round(
            ((t['exact'] + t['reprint']) / active_slots) * 100, 2
        )
        finish_pct = round((t['finish_fallback'] / active_slots) * 100, 2)
        vendor_pct = round(
            ((t['vendor_fallback'] + t['vendor_finish_fallback']) / active_slots)
            * 100,
            2,
        )

        db_rows.append((
            set_code,
            booster_name,
            mode,
            v,
            ev_avg,
            ev_mid90,
            ev_min,
            ev_max,
            ev_min5,
            ev_max5,
            __import__('json').dumps(quantiles),
            complete_pct,
            exact_pct,
            finish_pct,
            vendor_pct,
            t['failed_boosters'],
            self.sample_size,
        ))

    self.cursor.executemany(insert_sql, db_rows)
    self.conn.commit()

    # Return primary summary for console logging
    direct_all = [
        r
        for r in db_rows
        if r[2] == 'direct' and r[3] == 'all_cheapest'
    ][0]
    return {
        'ev_avg': direct_all[4],
        'ev_mid90': direct_all[5],
        'complete_pct': direct_all[10],
        'exact_pct': direct_all[11],
    }

  def _matches_audit(self, set_code, booster_name, price_mode, vendor):
    if not self.audit_config or not self.audit_config.get('enabled'):
      return False
    return True

  def _write_audit(self, set_code, booster_name, price_mode, vendor, samples, buckets):
    output_dir = Path(self.audit_config['output_dir'])
    output_path = output_dir / f'{set_code}_{booster_name}_{price_mode}_{vendor}'.lower()
    output_path = output_path.with_suffix('.json')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps({
        'setCode': set_code,
        'boosterName': booster_name,
        'priceMode': price_mode,
        'vendor': vendor,
        'sampleCount': len(samples),
        'samples': samples,
        'bucketMeans': buckets,
    }, indent=2), encoding='utf-8')
    print(f'   -> Wrote audit samples to {output_path}')

# ====================================================
# 5. MAIN EXECUTION PIPELINE
# ====================================================
def run_full_pipeline(sample_size: int = 5000, target_set: str = None, audit_config=None, quick_test_limit: int = None):
  db_config = DB_CONFIG

  engine = DatabaseBoosterEVEngine(db_config, sample_size=sample_size, audit_config=audit_config)

  # Fetch distinct paper booster configurations
  query = """
        SELECT DISTINCT sbc.setCode, sbc.boosterName, s.name as setName
        FROM setBoosterContents sbc
        JOIN sets s ON sbc.setCode = s.code
        WHERE (s.isOnlineOnly = 0 OR s.isOnlineOnly IS NULL)
          AND sbc.boosterName NOT IN ('arena', 'mtgo')
    """
  params = []
  if target_set:
    query += " AND sbc.setCode = %s"
    params.append(target_set.upper())
  query += " ORDER BY sbc.setCode, sbc.boosterName"

  engine.cursor.execute(query, tuple(params) if params else None)
  all_boosters = engine.cursor.fetchall()

  if quick_test_limit:
    all_boosters = all_boosters[:quick_test_limit]

  print('=' * 65)
  print(f'Starting Booster EV Engine -> MySQL `booster_ev_results` [Sample Size: {sample_size:,} packs]')
  if quick_test_limit:
    print(f'Quick test mode: limited to {len(all_boosters)} booster configurations')
  print(f'Total Paper Booster Configurations: {len(all_boosters)}')
  print(f'Database Target: {db_config["database"]}.booster_ev_results')
  print('=' * 65 + '\n')

  start_time = time.time()
  current_set = None

  for idx, row in enumerate(all_boosters, 1):
    set_code = row['setCode']
    booster_name = row['boosterName']
    set_name = row['setName'] or set_code

    if set_code != current_set:
      current_set = set_code
      print(f'\n[{convert_time(time.time() - start_time)}] Set {set_code} ({set_name}):')

    try:
      summary = engine.simulate_and_store(set_code, booster_name)
      if summary:
        print(
            f'   -> {booster_name:14s} | Direct EV: ${summary["ev_avg"]:6.2f} |'
            f' Mid 90%: ${summary["ev_mid90"]:6.2f} | Valid:'
            f' {summary["complete_pct"]}%'
        )
    except Exception as e:
      print(f'   -> Error on {set_code} {booster_name}: {e}')

  engine.close()
  total_time = time.time() - start_time
  print(
      f'\n[SUCCESS] Completed all sets in {convert_time(total_time)} and stored'
      ' to MySQL table `booster_ev_results`!'
  )


if __name__ == '__main__':
  import argparse
  parser = argparse.ArgumentParser(description='MTG Full Matrix Booster EV Engine')
  parser.add_argument(
      '--sample-size',
      type=int,
      default=5000,
      help='Number of simulated packs per booster (default: 5000)',
  )
  parser.add_argument(
      '--set',
      type=str,
      default=None,
      help='Filter to specific setCode (e.g. DFT)',
  )
  parser.add_argument('--audit-set', type=str, default=None, help='Capture one booster audit run for this set')
  parser.add_argument('--audit-booster', type=str, default='draft', help='Booster name for --audit-set')
  parser.add_argument('--audit-vendor', type=str, default='all_cheapest', help='Vendor for --audit-set')
  parser.add_argument('--audit-price-mode', type=str, default='direct', choices=['direct', 'cheapest_reprint'])
  parser.add_argument('--audit-output', type=str, default='backend/audit/booster_samples.json')
  parser.add_argument('--limit', type=int, default=None, help='Only simulate the first N booster configurations (quick test runs)')
  args = parser.parse_args()
  audit_config = {
      'enabled': AUDIT_ENABLED or bool(args.audit_set),
      'output_dir': AUDIT_OUTPUT_DIR,
  }
  if args.audit_output and args.audit_set:
    audit_config['output_dir'] = str(Path(args.audit_output).parent)
  quick_test_limit = args.limit or (int(os.environ['QUICK_TEST_LIMIT']) if os.environ.get('QUICK_TEST_LIMIT') else None)
  target_set = args.set or QUICK_TEST_SET
  run_full_pipeline(sample_size=args.sample_size, target_set=target_set, audit_config=audit_config, quick_test_limit=quick_test_limit)