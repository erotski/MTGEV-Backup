"""
sync_all_from_sqlite.py
Extracts 100% official MTGJSON contents for all 4,209 sealed products from AllPrintings.sqlite.
Recalculates arbitrage leaderboard with zero assumptions, strictly using MTGJSON contents.
Populates both packCount and total cardCount (with 0 for products with no packs).
"""
import sqlite3
import json
import os
from pathlib import Path

from ev_engine import evaluate_product_composite

ROOT_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DATA_DIR = ROOT_DIR / "public" / "data"
DIST_DATA_DIR = ROOT_DIR / "dist" / "data"

SQLITE_PATH = Path("/tmp/AllPrintings.sqlite")

def run_sync():
    print("=" * 70)
    print("Syncing MTGJSON sealed products and contents from SQLite...")
    print("=" * 70)

    if not SQLITE_PATH.exists():
        raise FileNotFoundError(f"SQLite file not found at {SQLITE_PATH}")

    # 1. Load existing prices from public/data/sealed_products.json
    existing_prices = {}
    if (PUBLIC_DATA_DIR / "sealed_products.json").exists():
        with open(PUBLIC_DATA_DIR / "sealed_products.json", "r", encoding="utf-8") as f:
            old_prods = json.load(f)
            for p in old_prods:
                uid = p.get("id") or p.get("uuid")
                if uid:
                    existing_prices[uid] = {
                        "marketPrice": p.get("marketPrice"),
                        "purchaseUrl": p.get("purchaseUrl"),
                        "priceFetchedAt": p.get("priceFetchedAt")
                    }

    # 2. Extract authoritative data from SQLite or JSON fallback
    sealed_products = []
    product_map = {}
    set_name_map = {}

    has_sqlite = False
    if SQLITE_PATH.exists() and SQLITE_PATH.stat().st_size > 1000:
        try:
            conn = sqlite3.connect(str(SQLITE_PATH))
            cursor = conn.cursor()
            cursor.execute("""
                SELECT uuid, name, setCode, category, subtype, cardCount, contents, purchaseUrls, identifiers
                FROM sealedProducts
                ORDER BY setCode, category, name
            """)
            rows = cursor.fetchall()

            for r in rows:
                uuid, name, set_code, category, subtype, card_count, contents_raw, purchase_urls_raw, identifiers_raw = r
                
                parsed_contents = None
                if contents_raw:
                    try:
                        parsed_contents = json.loads(contents_raw)
                    except Exception:
                        parsed_contents = None

                price_info = existing_prices.get(uuid, {})
                m_price = price_info.get("marketPrice")
                p_url = price_info.get("purchaseUrl")
                p_fetched = price_info.get("priceFetchedAt")

                prod_obj = {
                    "id": uuid,
                    "setCode": set_code,
                    "displayName": name,
                    "category": category,
                    "subtype": subtype,
                    "cardCount": card_count,
                    "contents": parsed_contents,
                    "marketPrice": m_price if m_price is not None else 0.0,
                    "purchaseUrl": p_url,
                    "priceFetchedAt": p_fetched
                }
                sealed_products.append(prod_obj)
                product_map[uuid] = prod_obj

            cursor.execute("SELECT code, name FROM sets")
            set_name_map = {r[0].lower(): r[1] for r in cursor.fetchall()}
            has_sqlite = True
            print(f"[OK] Extracted {len(sealed_products)} sealed products from MTGJSON SQLite.")
        except Exception as e:
            print(f"Note: SQLite unavailable ({e}), using JSON data directly.")
            has_sqlite = False

    if not has_sqlite:
        if (PUBLIC_DATA_DIR / "sealed_products.json").exists():
            with open(PUBLIC_DATA_DIR / "sealed_products.json", "r", encoding="utf-8") as f:
                sealed_products = json.load(f)
                for p in sealed_products:
                    uid = p.get("id") or p.get("uuid")
                    product_map[uid] = p
        if (PUBLIC_DATA_DIR / "sets.json").exists():
            with open(PUBLIC_DATA_DIR / "sets.json", "r", encoding="utf-8") as f:
                sets_data = json.load(f)
                for s in sets_data:
                    set_name_map[(s.get("code") or "").lower()] = s.get("name")
        print(f"[OK] Loaded {len(sealed_products)} sealed products from JSON.")
    with_contents = [p for p in sealed_products if p.get("contents")]
    print(f"[OK] {len(with_contents)} products have explicit MTGJSON contents.")

    # Save sealed_products.json
    for out_dir in [PUBLIC_DATA_DIR, DIST_DATA_DIR]:
        out_dir.mkdir(parents=True, exist_ok=True)
        with open(out_dir / "sealed_products.json", "w", encoding="utf-8") as f:
            json.dump(sealed_products, f, indent=2)
    print("[OK] Saved sealed_products.json to public/data and dist/data.")

    # 3. Load Booster EV table
    booster_ev_lookup = {}
    if (PUBLIC_DATA_DIR / "booster_ev.json").exists():
        with open(PUBLIC_DATA_DIR / "booster_ev.json", "r", encoding="utf-8") as f:
            ev_list = json.load(f)
            for ev in ev_list:
                s_code = (ev.get("setCode") or "").lower()
                b_name = (ev.get("boosterName") or "").lower()
                p_mode = (ev.get("priceMode") or "direct").lower()
                v_name = (ev.get("vendor") or "all_cheapest").lower()
                if v_name == "all":
                    v_name = "all_cheapest"
                booster_ev_lookup[(s_code, b_name, p_mode, v_name)] = ev

    # 4. Load Precon Decks for non-pack products
    precon_decks = {}
    if (PUBLIC_DATA_DIR / "precon_decks.json").exists():
        with open(PUBLIC_DATA_DIR / "precon_decks.json", "r", encoding="utf-8") as f:
            pd = json.load(f)
            precon_decks = pd.get("decks", {}) if isinstance(pd, dict) and "decks" in pd else pd

    # 4b. Load Single Card Prices for singles/promos in contents
    single_prices = {}
    if (PUBLIC_DATA_DIR / "single_card_prices.json").exists():
        with open(PUBLIC_DATA_DIR / "single_card_prices.json", "r", encoding="utf-8") as f:
            single_prices = json.load(f)

    # 5. Strict recursive composite product EV, pack, and card resolution engine
    # (shared with scripts/recompute_arbitrage_leaderboard.py via ev_engine.py)

    # 6. Build Arbitrage Leaderboard
    if has_sqlite:
        cursor.execute("SELECT code, name FROM sets")
        set_name_map = {r[0].lower(): r[1] for r in cursor.fetchall()}

    arbitrage_records = []
    for sp in sealed_products:
        m_price = sp.get("marketPrice")
        if not m_price or float(m_price) <= 0:
            continue
        m_price = float(m_price)

        uid = sp["id"]
        res = evaluate_product_composite(sp, product_map, booster_ev_lookup, precon_decks, single_prices)

        if res["evAvg"] <= 0:
            continue

        s_code = (sp.get("setCode") or "").lower()
        set_name = set_name_map.get(s_code, sp.get("setCode", "").upper())
        
        pack_count = res["packs"]
        card_count = res["cards"]
        box_ev_avg = res["evAvg"]
        box_ev_mid90 = res["evMid90"]
        box_ev_min = res["evMin"]
        box_ev_max = res["evMax"]
        b_name_display = res["boosterName"]

        pack_ev_avg = round(box_ev_avg / pack_count, 2) if pack_count > 0 else 0.0
        pack_ev_mid90 = round(box_ev_mid90 / pack_count, 2) if pack_count > 0 else 0.0
        pack_ev_min = round(box_ev_min / pack_count, 2) if pack_count > 0 else 0.0
        pack_ev_max = round(box_ev_max / pack_count, 2) if pack_count > 0 else 0.0

        arbitrage_val = round(box_ev_mid90 - m_price, 2)
        roi = round((arbitrage_val / m_price) * 100, 2)

        arbitrage_records.append({
            "productUuid": uid,
            "boxName": sp.get("displayName"),
            "category": sp.get("category"),
            "setCode": sp.get("setCode", "").upper(),
            "setName": set_name,
            "marketPrice": m_price,
            "packCount": pack_count,
            "cardCount": card_count,
            "boosterName": b_name_display,
            "unitEvAvg": pack_ev_avg,
            "unitEvMid90": pack_ev_mid90,
            "unitEvMin": pack_ev_min,
            "unitEvMax": pack_ev_max,
            "totalEvAvg": box_ev_avg,
            "totalEvMid90": box_ev_mid90,
            "totalEvMin": box_ev_min,
            "totalEvMax": box_ev_max,
            "arbitrageValue": arbitrage_val,
            "roiPercent": roi,
            "purchaseUrl": sp.get("purchaseUrl"),
            "contents": sp.get("contents")
        })

    arbitrage_records.sort(key=lambda x: x["arbitrageValue"], reverse=True)
    print(f"[OK] Generated {len(arbitrage_records)} arbitrage leaderboard records.")

    for out_dir in [PUBLIC_DATA_DIR, DIST_DATA_DIR]:
        with open(out_dir / "arbitrage_leaderboard.json", "w", encoding="utf-8") as f:
            json.dump(arbitrage_records, f, indent=2)

    # Check sample products (both pack and 0-pack)
    print("\nSample Leaderboard Records:")
    for r in arbitrage_records[:5]:
        print(f"  [{r['setCode']}] {r['boxName'][:40]} | Packs: {r['packCount']} | Cards: {r['cardCount']} | Price: ${r['marketPrice']:.2f} | EV: ${r['totalEvAvg']:.2f}")

    for r in arbitrage_records:
        if r['packCount'] == 0:
            print(f"\nSample 0-Pack Deck Record: [{r['setCode']}] {r['boxName']} | Packs: {r['packCount']} | Cards: {r['cardCount']} | Price: ${r['marketPrice']:.2f} | EV: ${r['totalEvAvg']:.2f}")
            break

if __name__ == "__main__":
    run_sync()
