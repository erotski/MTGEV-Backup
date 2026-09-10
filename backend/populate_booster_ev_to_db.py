from collections import defaultdict
import json
import os
from pathlib import Path
import time
import mysql.connector
import numpy as np
from config import DB_CONFIG


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


def is_ignored_sheet(sheet_name: str) -> bool:
  s_lower = sheet_name.lower()
  return any(kw in s_lower for kw in IGNORED_SHEET_KEYWORDS)


class DatabaseBoosterEVEngine:

  def __init__(self, db_config, sample_size=5000, hi_lo_ratio=0.05):
    self.db_config = db_config
    self.sample_size = sample_size
    self.hi_lo_ratio = hi_lo_ratio
    self.trim_count = max(1, int(sample_size * hi_lo_ratio))

    self.card_cache = {}
    self.price_cache = {}
    self.lowest_cache = {}

    self.conn = mysql.connector.connect(**self.db_config)
    self.cursor = self.conn.cursor(dictionary=True)

    self._init_database_schema()

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
  # 2. PRICE RESOLUTION ENGINE
  # ====================================================
  def resolve_card_price(
      self,
      uuid: str,
      requested_finish: str,
      target_vendor: str,
      use_reprints: bool,
  ):
    """Hierarchy: Exact Match -> Finish Fallback (Normal > Foil > Etched) -> Different Vendor -> UNPRICED."""
    card = self.card_cache.get(uuid)
    if not card or card['is_online']:
      return None, 'unpriced'
    if card['is_ignored']:
      return 0.0, 'ignored'

    finish_fallback_order = (
        ['foil', 'normal', 'etched']
        if requested_finish == 'foil'
        else ['normal', 'foil', 'etched']
    )
    target_vendor = target_vendor.lower()

    # 1. Direct Set Printing Mode
    if not use_reprints:
      vendors_available = self.price_cache.get(uuid, {})
      if vendors_available:
        # Step 1: Exact Match
        if (
            target_vendor in vendors_available
            and requested_finish in vendors_available[target_vendor]
        ):
          return vendors_available[target_vendor][requested_finish], 'exact'

        # Step 2: Finish Fallback (Same Vendor)
        if target_vendor in vendors_available:
          vendor_finishes = vendors_available[target_vendor]
          for f in finish_fallback_order:
            if f in vendor_finishes:
              return vendor_finishes[f], 'finish_fallback'

        # Step 3: Different Vendor (Same Finish)
        for alt_vendor, finishes in vendors_available.items():
          if alt_vendor != target_vendor and requested_finish in finishes:
            return finishes[requested_finish], 'vendor_fallback'

        # Step 4: Different Vendor + Finish Fallback
        for alt_vendor, finishes in vendors_available.items():
          if alt_vendor != target_vendor:
            for f in finish_fallback_order:
              if f in finishes:
                return finishes[f], 'vendor_finish_fallback'

    # 2. Cheapest Reprint Mode
    if use_reprints:
      name = card['name']
      lowest_data = self.lowest_cache.get(name)
      if lowest_data and lowest_data['sellers']:
        # Step 1: Exact Match from Lowest Table
        if (
            target_vendor in lowest_data['sellers']
            and requested_finish in lowest_data['sellers'][target_vendor]
        ):
          return (
              lowest_data['sellers'][target_vendor][requested_finish],
              'reprint',
          )

        # Step 2: Finish Fallback (Same Vendor)
        if target_vendor in lowest_data['sellers']:
          vendor_finishes = lowest_data['sellers'][target_vendor]
          for f in finish_fallback_order:
            if f in vendor_finishes:
              return vendor_finishes[f], 'finish_fallback'

        # Step 3: Different Vendor (Same Finish)
        for alt_vendor, finishes in lowest_data['sellers'].items():
          if alt_vendor != target_vendor and requested_finish in finishes:
            return finishes[requested_finish], 'vendor_fallback'

        # Step 4: Any Lowest Price
        if lowest_data['min_all'] is not None:
          return lowest_data['min_all'], 'vendor_finish_fallback'

    return None, 'unpriced'

  def resolve_card_price_global(
      self, uuid: str, requested_finish: str, use_reprints: bool
  ):
    """Global (All Vendors) Lowest Price Resolution."""
    card = self.card_cache.get(uuid)
    if not card or card['is_online']:
      return None, 'unpriced'
    if card['is_ignored']:
      return 0.0, 'ignored'

    finish_fallback_order = (
        ['foil', 'normal', 'etched']
        if requested_finish == 'foil'
        else ['normal', 'foil', 'etched']
    )

    if not use_reprints:
      vendors_available = self.price_cache.get(uuid, {})
      if vendors_available:
        prices_exact = [
            finishes[requested_finish]
            for finishes in vendors_available.values()
            if requested_finish in finishes
        ]
        if prices_exact:
          return min(prices_exact), 'exact'

        for f in finish_fallback_order:
          prices_finish = [
              finishes[f]
              for finishes in vendors_available.values()
              if f in finishes
          ]
          if prices_finish:
            return min(prices_finish), 'finish_fallback'

    if use_reprints:
      lowest_data = self.lowest_cache.get(card['name'])
      if lowest_data and lowest_data['sellers']:
        prices_exact = [
            finishes[requested_finish]
            for finishes in lowest_data['sellers'].values()
            if requested_finish in finishes
        ]
        if prices_exact:
          return min(prices_exact), 'reprint'

        for f in finish_fallback_order:
          prices_finish = [
              finishes[f]
              for finishes in lowest_data['sellers'].values()
              if f in finishes
          ]
          if prices_finish:
            return min(prices_finish), 'finish_fallback'

        if lowest_data['min_all'] is not None:
          return lowest_data['min_all'], 'vendor_fallback'

    return None, 'unpriced'

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

    sheets = defaultdict(lambda: {'cards': {}, 'foil': False})
    for row in card_rows:
      s_name = row['sheetName']
      sheets[s_name]['cards'][row['cardUuid']] = float(row['cardWeight'])
      sheets[s_name]['foil'] = sheet_meta.get(s_name, False)

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
    sellers = sorted([s for s in sellers if s])
    if not sellers:
      sellers = ['tcgplayer', 'cardmarket']

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

      req_finish = 'foil' if sheet.get('foil', False) else 'normal'

      matrix = {
          'direct': {'all': [], **{s: [] for s in sellers}},
          'cheapest_reprint': {'all': [], **{s: [] for s in sellers}},
      }
      status_matrix = {
          'direct': {'all': [], **{s: [] for s in sellers}},
          'cheapest_reprint': {'all': [], **{s: [] for s in sellers}},
      }

      for u in u_list:
        # Direct
        p_all_dir, st_all_dir = self.resolve_card_price_global(
            u, req_finish, use_reprints=False
        )
        matrix['direct']['all'].append(p_all_dir)
        status_matrix['direct']['all'].append(st_all_dir)

        for s in sellers:
          p_v_dir, st_v_dir = self.resolve_card_price(
              u, req_finish, target_vendor=s, use_reprints=False
          )
          matrix['direct'][s].append(p_v_dir)
          status_matrix['direct'][s].append(st_v_dir)

        # Cheapest Reprint
        p_all_rep, st_all_rep = self.resolve_card_price_global(
            u, req_finish, use_reprints=True
        )
        matrix['cheapest_reprint']['all'].append(p_all_rep)
        status_matrix['cheapest_reprint']['all'].append(st_all_rep)

        for s in sellers:
          p_v_rep, st_v_rep = self.resolve_card_price(
              u, req_finish, target_vendor=s, use_reprints=True
          )
          matrix['cheapest_reprint'][s].append(p_v_rep)
          status_matrix['cheapest_reprint'][s].append(st_v_rep)

      sheet_data[sheet_name] = {
          'uuids': u_list,
          'weights': w_list,
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

    all_vendors_list = ['all'] + sellers
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

    for mode in modes:
      for v in all_vendors_list:
        arr = valid_packs[mode][v]
        t = telemetry_status[mode][v]
        active_slots = max(1, t['total_slots'] - t['ignored'])

        if arr:
          np_arr = np.array(arr)
          s_arr = np.sort(np_arr)
          
          if set_code.upper() == 'HOB' and booster_name.lower() == 'play' and mode.lower() == 'direct' and v.lower() == 'tcgplayer':
              import json
              import os
              os.makedirs('public/data', exist_ok=True)
              with open('public/data/hob_play_tcgplayer_5000.json', 'w') as f:
                  json.dump(s_arr.tolist(), f)
          
          trim = max(1, int(len(s_arr) * self.hi_lo_ratio))
          mid = s_arr[trim:-trim] if len(s_arr) > trim * 2 else s_arr

          ev_avg = round(float(np.mean(np_arr)), 2)
          ev_mid90 = round(float(np.mean(mid)), 2)
          ev_min = round(float(np.min(np_arr)), 2)
          ev_max = round(float(np.max(np_arr)), 2)
          ev_min5 = round(float(np.mean(s_arr[:trim])), 2)
          ev_max5 = round(float(np.mean(s_arr[-trim:])), 2)

          # Calculate 100 samples from 5,000 simulations (average of each 50-increment bucket)
          bucket_size = max(1, len(s_arr) // 100)
          quantiles = [
              round(float(np.mean(s_arr[i * bucket_size : (i + 1) * bucket_size])), 2)
              for i in range(100)
          ]
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
            json.dumps(quantiles),
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
        if r[2] == 'direct' and r[3] == 'all'
    ][0]
    return {
        'ev_avg': direct_all[4],
        'ev_mid90': direct_all[5],
        'complete_pct': direct_all[10],
        'exact_pct': direct_all[11],
    }

  def get_card_price(self, uuid: str, requested_finish: str, use_reprints: bool, vendor: str = 'all'):
    """Helper to resolve card price with on-demand prefetch if needed."""
    if uuid not in self.card_cache:
      try:
        self.prefetch_cards([uuid])
      except Exception:
        pass
    if vendor == 'all':
      return self.resolve_card_price_global(uuid, requested_finish, use_reprints)
    else:
      return self.resolve_card_price(uuid, requested_finish, vendor, use_reprints)

  def calculate_sealed_product_ev(self, contents: dict, mode: str = 'direct', vendor: str = 'all') -> float:
    """Calculates EV for a sealedProduct with JSON `contents` (deck, variable, booster, card)."""
    if not contents:
      return 0.0
    
    total_ev = 0.0
    use_reprints = (mode == 'cheapest_reprint')

    # 1. Guaranteed cards (e.g. promo cards, box toppers)
    if 'card' in contents and isinstance(contents['card'], list):
      for c in contents['card']:
        uuid = c.get('uuid')
        finish = 'foil' if c.get('foil') else 'normal'
        if uuid:
          p, _ = self.get_card_price(uuid, finish, use_reprints, vendor)
          if p:
            total_ev += p

    # 2. Preconstructed decks (e.g. Signature Spellbook deck, Commander deck)
    deck_cards_ev = 0.0
    deck_card_count = 0
    if 'deck' in contents and isinstance(contents['deck'], list):
      for d in contents['deck']:
        deck_name = d.get('name')
        deck_set = d.get('set')
        if deck_name and deck_set:
          # Fetch cards in this deck from the database deck cards table or card associations
          try:
            self.cursor.execute(
              """
              SELECT c.uuid, dc.count, dc.isFoil
              FROM deckCards dc
              JOIN decks dk ON dc.deckId = dk.id
              JOIN cards c ON dc.cardUuid = c.uuid
              WHERE dk.name = %s AND dk.code = %s
              """,
              (deck_name, deck_set)
            )
            rows = self.cursor.fetchall()
            for r in rows:
              count = r.get('count', 1) or 1
              finish = 'foil' if r.get('isFoil') else 'normal'
              p, _ = self.get_card_price(r['uuid'], finish, use_reprints, vendor)
              if p:
                deck_cards_ev += p * count
              deck_card_count += count
          except Exception:
            pass

    # If the product logic specifies that 1 card is foil (replaces a card, not +1 bonus card)
    # e.g., Signature Spellbooks where 1 of the 8 cards is upgraded to foil (7 normal + 1 foil = 8 cards total)
    foil_replaces_card = contents.get('foil_replaces_card') or (
      contents.get('note') and 'not +1' in contents.get('note', '').lower()
    )
    if foil_replaces_card and deck_card_count > 0:
      # Each card has (deck_card_count - 1) / deck_card_count chance of being regular finish
      total_ev += (deck_cards_ev * (deck_card_count - 1)) / deck_card_count
    else:
      total_ev += deck_cards_ev

    # 3. Booster packs contained (e.g. Booster box, Bundles, Prerelease kits)
    if 'pack' in contents and isinstance(contents['pack'], list):
      for p in contents['pack']:
        p_code = p.get('code') or 'play'
        p_set = (p.get('set') or '').upper()
        p_count = int(p.get('count', 1) or 1)
        try:
          self.cursor.execute(
            """
            SELECT ev_average 
            FROM booster_ev_results 
            WHERE set_code = %s AND booster_name = %s AND price_mode = %s AND vendor = %s
            LIMIT 1
            """,
            (p_set, p_code, mode, vendor)
          )
          row = self.cursor.fetchone()
          if row and row.get('ev_average'):
            total_ev += float(row['ev_average']) * p_count
          else:
            self.cursor.execute(
              """
              SELECT ev_average 
              FROM booster_ev_results 
              WHERE set_code = %s AND price_mode = %s AND vendor = %s
              ORDER BY ev_average DESC
              LIMIT 1
              """,
              (p_set, mode, vendor)
            )
            row2 = self.cursor.fetchone()
            if row2 and row2.get('ev_average'):
              total_ev += float(row2['ev_average']) * p_count
        except Exception:
          pass

    # 4. Variable weighted slots (e.g. Signature Spellbook 1-of-8 foil slot)
    if 'variable' in contents and isinstance(contents['variable'], list):
      for var_slot in contents['variable']:
        configs = var_slot.get('configs', [])
        total_weight = 0.0
        weighted_sum = 0.0
        for cfg in configs:
          weight = 1.0
          if 'variable_config' in cfg and cfg['variable_config']:
            weight = float(cfg['variable_config'][0].get('weight', 1.0))
          total_weight += weight

          # Card option
          if 'card' in cfg and cfg['card']:
            c = cfg['card'][0]
            uuid = c.get('uuid')
            finish = 'foil' if c.get('foil') else 'normal'
            if uuid:
              p, _ = self.get_card_price(uuid, finish, use_reprints, vendor)
              if p:
                weighted_sum += p * weight

          # Contained pack option inside variable slot
          elif 'pack' in cfg and cfg['pack']:
            p_obj = cfg['pack'][0]
            p_code = p_obj.get('code') or 'play'
            p_set = (p_obj.get('set') or '').upper()
            try:
              self.cursor.execute(
                """
                SELECT ev_average FROM booster_ev_results 
                WHERE set_code = %s AND booster_name = %s AND price_mode = %s AND vendor = %s LIMIT 1
                """,
                (p_set, p_code, mode, vendor)
              )
              row = self.cursor.fetchone()
              if row and row.get('ev_average'):
                weighted_sum += float(row['ev_average']) * weight
            except Exception:
              pass

        if total_weight > 0:
          total_ev += weighted_sum / total_weight

    return round(total_ev, 2)


# ====================================================
# 5. MAIN EXECUTION PIPELINE
# ====================================================
def run_full_pipeline(sample_size: int = 5000, target_set: str = None):
  db_config = DB_CONFIG

  engine = DatabaseBoosterEVEngine(db_config, sample_size=sample_size)

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

  print('=' * 65)
  print(f'Starting Booster EV Engine -> MySQL `booster_ev_results` [Sample Size: {sample_size:,} packs]')
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
  args = parser.parse_args()
  run_full_pipeline(sample_size=args.sample_size, target_set=args.set)