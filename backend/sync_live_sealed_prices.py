import json
import os
import time
import mysql.connector
import requests
from config import DB_CONFIG


def ensure_table(cursor):
    """Creates/migrates sealedproducts_prices with one row per product (by uuid)."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sealedproducts_prices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sealedproduct_uuid VARCHAR(36) NOT NULL,
            purchase_url TEXT,
            final_url TEXT,
            market_price FLOAT,
            currency VARCHAR(10),
            status VARCHAR(32),
            notes TEXT,
            fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY ux_sealedproduct_uuid (sealedproduct_uuid),
            INDEX idx_sealedproduct_uuid (sealedproduct_uuid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)

    # Migrate older tables that used a composite (uuid, purchase_url) unique key
    # into a single per-uuid unique key, since this script keeps one row per product.
    cursor.execute("""
        SELECT COUNT(*) AS cnt FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'sealedproducts_prices'
          AND index_name = 'ux_sealedproduct_uuid'
    """)
    if cursor.fetchone()['cnt'] == 0:
        cursor.execute("""
            ALTER TABLE sealedproducts_prices
            ADD UNIQUE KEY ux_sealedproduct_uuid (sealedproduct_uuid)
        """)


def sync_all_sealed_prices():
  db_config = DB_CONFIG

  conn = mysql.connector.connect(**db_config, autocommit=True)
  cursor = conn.cursor(dictionary=True)
  ensure_table(cursor)

  # Fetch all products that have identifiers
  cursor.execute("""
        SELECT uuid, name, setCode, category, identifiers
        FROM sealedProducts
        WHERE identifiers IS NOT NULL AND identifiers != ''
        ORDER BY setCode DESC, name;
    """)

  raw_products = cursor.fetchall()
  products = []

  for p in raw_products:
    ident_raw = p.get('identifiers')
    tcg_id = None
    if ident_raw:
      try:
        ident_dict = (
            json.loads(ident_raw) if isinstance(ident_raw, str) else ident_raw
        )
        tcg_id = ident_dict.get('tcgplayerProductId')
      except Exception:
        pass

    if tcg_id:
      try:
        p['tcgplayerProductId'] = int(tcg_id)
        products.append(p)
      except Exception:
        pass

  quick_test_limit = int(os.environ['QUICK_TEST_LIMIT']) if os.environ.get('QUICK_TEST_LIMIT') else None
  if quick_test_limit:
    products = products[:quick_test_limit]

  print('=' * 70)
  print(
      f'Starting Live TCGplayer Market Price Sync for {len(products)} products'
  )
  print('=' * 70 + '\n')

  session = requests.Session()
  headers = {
      'User-Agent': (
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,'
          ' like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ),
      'Accept': 'application/json',
  }

  update_sql = """
        INSERT INTO sealedproducts_prices
            (sealedproduct_uuid, purchase_url, market_price, currency, status, notes, fetched_at)
        VALUES (%s, %s, %s, 'USD', %s, 'tcgplayer live API', CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
            purchase_url = VALUES(purchase_url),
            market_price = COALESCE(VALUES(market_price), market_price),
            currency = COALESCE(VALUES(currency), currency),
            status = VALUES(status),
            fetched_at = CURRENT_TIMESTAMP;
    """


  updated_count = 0
  missing_count = 0
  missing_examples = []
  start_time = time.time()

  for idx, p in enumerate(products, 1):
    tcg_id = p['tcgplayerProductId']
    p_uuid = p['uuid']
    p_name = p['name']
    p_set = p.get('setCode') or '???'

    detail_url = (
        f'https://mp-search-api.tcgplayer.com/v1/product/{tcg_id}/details'
    )
    product_page_url = f'https://www.tcgplayer.com/product/{tcg_id}'
    real_market_price = None

    # Primary: mp-search-api details endpoint (reliable, no auth required)
    try:
      resp = session.get(detail_url, headers=headers, timeout=8)
      if resp.status_code == 200:
        data = resp.json()
        real_market_price = (
            data.get('marketPrice')
            or data.get('medianPrice')
            or data.get('lowestPriceWithShipping')
            or data.get('lowestPrice')
        )
    except Exception:
      pass

    # Secondary: infinite-api (kept as an opportunistic alternate source;
    # falls back regardless of the exact failure status, e.g. 403 or 404)
    if not real_market_price:
      try:
        alt_url = f'https://infinite-api.tcgplayer.com/price/v1/product/{tcg_id}'
        alt_resp = session.get(alt_url, headers=headers, timeout=8)
        if alt_resp.status_code == 200:
          alt_data = alt_resp.json()
          real_market_price = (
              alt_data.get('marketPrice')
              or alt_data.get('medianPrice')
              or alt_data.get('lowestPriceWithShipping')
              or alt_data.get('lowestPrice')
          )
      except Exception:
        pass

    if real_market_price and float(real_market_price) > 0:
      status = 'success'
      cursor.execute(
          update_sql,
          (p_uuid, product_page_url, float(real_market_price), status),
      )
      updated_count += 1
    else:
      status = 'no_price_found'
      cursor.execute(update_sql, (p_uuid, product_page_url, None, status))
      missing_count += 1
      if len(missing_examples) < 10:
        missing_examples.append(f'{p_set}:{p_name}')

    # Polite rate limiting (~10 requests/sec)
    time.sleep(0.08)

  cursor.close()
  conn.close()

  elapsed = time.time() - start_time
  print('\n' + '=' * 70)
  print(
      f'[SUCCESS] Market price fetch: {updated_count}/{len(products)} priced, '
      f'{missing_count} missing, {int(elapsed)}s'
  )
  if missing_examples:
    print('[SUMMARY] Missing price examples: ' + ' | '.join(missing_examples))
  print('=' * 70)


if __name__ == '__main__':
  sync_all_sealed_prices()