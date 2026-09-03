"""
export_app_data.py — Exports synced MySQL data directly to JSON files for the React App.
Executes in GitHub Actions or locally to generate static JSON files inside public/data/.
"""
import json
import os
from pathlib import Path
import mysql.connector
from config import DB_CONFIG

# Target output directory: public/data in root
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def export_all():
    print("=" * 70)
    print("Exporting MySQL Data to React App JSON Files...")
    print(f"Destination: {OUTPUT_DIR}")
    print("=" * 70)

    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
    except Exception as e:
        print(f"[ERROR] Could not connect to MySQL database: {e}")
        raise


    # 1. Export Sets List
    print("▶ 1. Exporting sets.json...")
    try:
        cursor.execute("""
            SELECT DISTINCT 
                s.code, 
                s.name, 
                s.releaseDate, 
                s.type, 
                s.baseSetSize, 
                s.totalSetSize,
                EXISTS(SELECT 1 FROM setBoosterContents sbc WHERE sbc.setCode = s.code AND sbc.boosterName LIKE '%play%') as hasPlayBooster,
                EXISTS(SELECT 1 FROM setBoosterContents sbc WHERE sbc.setCode = s.code AND sbc.boosterName LIKE '%collector%') as hasCollectorBooster,
                EXISTS(SELECT 1 FROM sealedProducts sp WHERE sp.setCode = s.code AND sp.category = 'bundle') as hasBundle,
                EXISTS(SELECT 1 FROM sealedProducts sp WHERE sp.setCode = s.code AND (sp.category = 'deck' OR sp.subtype LIKE '%commander%')) as hasCommanderDecks
            FROM sets s
            LEFT JOIN booster_ev_results bev ON s.code = bev.set_code
            WHERE (s.isOnlineOnly = 0 OR s.isOnlineOnly IS NULL)
              AND EXISTS(SELECT 1 FROM sealedProducts sp WHERE sp.setCode = s.code)
            ORDER BY s.releaseDate DESC;
        """)
        sets = cursor.fetchall()
        with open(OUTPUT_DIR / "sets.json", "w", encoding="utf-8") as f:
            json.dump(sets, f, indent=2, default=str)
        print(f"  ✔ Exported {len(sets)} active sets")
    except Exception as e:
        print(f"  ✘ Error exporting sets: {e}")

    # 2. Export Sealed Products with True Market Prices
    print("▶ 2. Exporting sealed_products.json...")
    try:
        cursor.execute("""
            SELECT 
                sp.uuid as id,
                sp.setCode,
                sp.name as displayName,
                sp.category,
                sp.subtype,
                sp.cardCount,
                sp.contents,
                COALESCE(spp.market_price, 0.0) as marketPrice,
                spp.purchase_url as purchaseUrl,
                spp.fetched_at as priceFetchedAt
            FROM sealedProducts sp
            LEFT JOIN sealedproducts_prices spp ON sp.uuid = spp.sealedproduct_uuid
            ORDER BY sp.setCode, sp.category, sp.name;
        """)
        products = cursor.fetchall()
        for p in products:
            if p.get("contents") and isinstance(p["contents"], str):
                try:
                    p["contents"] = json.loads(p["contents"])
                except Exception:
                    pass
        with open(OUTPUT_DIR / "sealed_products.json", "w", encoding="utf-8") as f:
            json.dump(products, f, indent=2, default=str)
        print(f"  ✔ Exported {len(products)} sealed products")
    except Exception as e:
        print(f"  ✘ Error exporting sealed products: {e}")

    # 3. Export Booster EV Simulation Results
    print("▶ 3. Exporting booster_ev.json...")
    try:
        cursor.execute("""
            SELECT 
                set_code as setCode,
                booster_name as boosterName,
                price_mode as priceMode,
                vendor,
                ev_average as evAverage,
                ev_mid90 as evMid90,
                ev_min as evMin,
                ev_max as evMax,
                ev_min5 as evMin5,
                ev_max5 as evMax5,
                complete_booster_pct as completeBoosterPct,
                exact_match_pct as exactMatchPct,
                different_finish_pct as differentFinishPct,
                different_vendor_pct as differentVendorPct,
                failed_boosters as failedBoosters,
                simulated_packs as simulatedPacks,
                updated_at as updatedAt
            FROM booster_ev_results;
        """)
        ev_results = cursor.fetchall()
        with open(OUTPUT_DIR / "booster_ev.json", "w", encoding="utf-8") as f:
            json.dump(ev_results, f, indent=2, default=str)
        print(f"  ✔ Exported {len(ev_results)} booster EV simulations")
    except Exception as e:
        print(f"  ✘ Error exporting booster EV results: {e}")

    # 4. Generate & Export Full Arbitrage Leaderboard (Box, Pack, Bundle, Decks)
    print("▶ 4. Exporting arbitrage_leaderboard.json...")
    try:
        # Pre-load booster EV lookup by (set_code, booster_name)
        cursor.execute("""
            SELECT set_code, booster_name, ev_average, ev_mid90, exact_match_pct, updated_at
            FROM booster_ev_results
            WHERE price_mode = 'direct' AND vendor = 'all' AND ev_average > 0;
        """)
        ev_rows = cursor.fetchall()
        ev_by_set = {}
        for r in ev_rows:
            sc = (r.get("set_code") or "").upper()
            bn = (r.get("booster_name") or "").lower()
            if sc not in ev_by_set:
                ev_by_set[sc] = {}
            ev_by_set[sc][bn] = r

        # Query active sealed products with market prices directly from DB
        cursor.execute("""
            SELECT 
                sp.uuid as productUuid,
                sp.name as boxName,
                sp.category as spCategory,
                sp.subtype as spSubtype,
                sp.cardCount as spCardCount,
                sp.setCode,
                s.name as setName,
                spp.market_price as boxMarketPrice,
                sp.contents as contents
            FROM sealedProducts sp
            JOIN sets s ON sp.setCode = s.code
            JOIN sealedproducts_prices spp ON sp.uuid = spp.sealedproduct_uuid
            WHERE spp.market_price IS NOT NULL AND spp.market_price > 0
            ORDER BY sp.setCode, sp.name;
        """)
        arbs = cursor.fetchall()
        
        valid_arbs = []
        for a in arbs:
            # Parse contents JSON directly from DB
            raw_contents = a.get("contents")
            contents = None
            if raw_contents and isinstance(raw_contents, str):
                try:
                    contents = json.loads(raw_contents)
                except Exception:
                    contents = None
            elif isinstance(raw_contents, dict):
                contents = raw_contents

            a["contents"] = contents

            sp_cat = (a.get("spCategory") or "").lower()
            sp_sub = (a.get("spSubtype") or "").lower()
            set_code = (a.get("setCode") or "").upper()
            box_price = float(a.get("boxMarketPrice") or 0.0)

            if box_price <= 0:
                continue

            set_boosters = ev_by_set.get(set_code, {})
            if not set_boosters:
                continue

            # Strictly database-driven booster selection (rely on database subtype, no title substring guessing)
            matched_booster = None
            if sp_sub in set_boosters:
                matched_booster = sp_sub
            elif "play" in set_boosters:
                matched_booster = "play"
            elif "draft" in set_boosters:
                matched_booster = "draft"
            elif "default" in set_boosters:
                matched_booster = "default"
            elif set_boosters:
                matched_booster = next(iter(set_boosters))

            if not matched_booster or matched_booster not in set_boosters:
                continue

            ev_info = set_boosters[matched_booster]
            pack_ev = float(ev_info.get("ev_average") or 0.0)
            pack_mid = float(ev_info.get("ev_mid90") or 0.0)

            if pack_ev <= 0:
                continue

            # Strictly database-driven category & pack count logic:
            # 1. If explicit database contents exist, use exact counts from database
            # 2. Otherwise determine packs strictly by database category & subtype
            packs = None
            final_cat = sp_cat if sp_cat in ["booster_box", "booster_case", "booster_pack", "bundle", "deck", "box_set"] else "other"

            if contents and isinstance(contents, dict) and contents.get("pack"):
                packs = sum(int(p.get("count", 1) or 1) for p in contents["pack"])
            elif contents and isinstance(contents, dict) and (contents.get("deck") or contents.get("variable") or contents.get("card")):
                packs = 1
            elif sp_cat in ["booster_pack", "deck", "box_set", "deck_box", "kit", "multiple_decks"]:
                packs = 1
            elif sp_cat == "booster_box":
                packs = 12 if sp_sub == "collector" else (24 if sp_sub == "jumpstart" else 36)
            elif sp_cat in ["booster_case", "bundle_case", "limited_aid_case"]:
                packs = 72 if sp_sub == "collector" else (144 if sp_sub == "jumpstart" else 216)
            elif sp_cat in ["bundle", "limited_aid_tool"]:
                packs = 9
            else:
                packs = 1

            box_ev_avg = round(pack_ev * packs, 2)
            box_ev_mid90 = round(pack_mid * packs, 2)
            profit_usd = round(box_ev_avg - box_price, 2)
            roi_pct = round((profit_usd / box_price) * 100, 2)

            # Clean temporary helper keys
            a.pop('spCategory', None)
            a.pop('spSubtype', None)
            a.pop('spCardCount', None)

            a['category'] = final_cat
            a['boosterName'] = matched_booster
            a['packCount'] = packs
            a['packEvAvg'] = str(pack_ev)
            a['packEvMid90'] = str(pack_mid)
            a['completePct'] = str(ev_info.get("exact_match_pct", "100.00"))
            a['updatedAt'] = str(ev_info.get("updated_at") or "")
            a['boxEvAvg'] = box_ev_avg
            a['boxEvMid90'] = box_ev_mid90
            a['profitUsd'] = profit_usd
            a['roiPct'] = roi_pct
            a['vendor'] = 'tcgplayer'
            a['priceMode'] = 'direct'
            valid_arbs.append(a)

        # Sort by best ROI
        valid_arbs.sort(key=lambda x: x['roiPct'], reverse=True)

        with open(OUTPUT_DIR / "arbitrage_leaderboard.json", "w", encoding="utf-8") as f:
            json.dump(valid_arbs, f, indent=2, default=str)
        print(f"  ✔ Exported {len(valid_arbs)} product arbitrage opportunities")
    except Exception as e:
        print(f"  ✘ Error exporting arbitrage leaderboard: {e}")

    cursor.close()
    conn.close()
    print("\n[SUCCESS] Pipeline export complete. Ready for React frontend deployment!")

if __name__ == "__main__":
    export_all()
