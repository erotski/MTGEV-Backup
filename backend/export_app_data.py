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
        cursor.execute("""
            SELECT 
                sp.uuid as productUuid,
                sp.name as boxName,
                sp.category as spCategory,
                sp.subtype as spSubtype,
                sp.cardCount as spCardCount,
                sp.setCode,
                s.name as setName,
                CASE 
                    WHEN sp.name LIKE '%Collector%' THEN 'collector'
                    WHEN sp.name LIKE '%Play%' THEN 'play'
                    WHEN sp.name LIKE '%Draft%' THEN 'draft'
                    WHEN sp.name LIKE '%Set Booster%' THEN 'set'
                    ELSE 'play'
                END as boosterName,
                COALESCE(spp.market_price, 0.0) as boxMarketPrice,
                COALESCE(ev.ev_average, 0.0) as packEvAvg,
                COALESCE(ev.ev_mid90, 0.0) as packEvMid90,
                COALESCE(ev.exact_match_pct, 100.0) as completePct,
                COALESCE(ev.updated_at, CURRENT_TIMESTAMP) as updatedAt,
                sp.contents as contents
            FROM sealedProducts sp
            JOIN sets s ON sp.setCode = s.code
            LEFT JOIN sealedproducts_prices spp ON sp.uuid = spp.sealedproduct_uuid
            LEFT JOIN booster_ev_results ev ON sp.setCode = ev.set_code 
                 AND (
                    (sp.name LIKE '%Collector%' AND ev.booster_name = 'collector') OR
                    (sp.name NOT LIKE '%Collector%' AND (ev.booster_name = 'play' OR ev.booster_name = 'default' OR ev.booster_name = 'draft'))
                 )
                 AND ev.price_mode = 'direct' AND ev.vendor = 'all'
            WHERE (spp.market_price IS NOT NULL AND spp.market_price > 0)
               OR (ev.ev_average IS NOT NULL AND ev.ev_average > 0)
            ORDER BY sp.setCode, sp.name;
        """)
        arbs = cursor.fetchall()
        
        valid_arbs = []
        for a in arbs:
            # Parse contents JSON
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

            name_lower = (a.get("boxName") or "").lower()
            sp_cat = (a.get("spCategory") or "").lower()
            pack_ev = float(a.get("packEvAvg") or 0.0)
            pack_mid = float(a.get("packEvMid90") or 0.0)
            box_price = float(a.get("boxMarketPrice") or 0.0)

            # Determine product structure & pack count
            if contents and isinstance(contents, dict) and contents.get("pack"):
                # 1. Product with explicit booster pack contents
                packs = sum(int(p.get("count", 1) or 1) for p in contents["pack"])
                a["packCount"] = packs
                if packs >= 12:
                    a["category"] = "booster_box"
                elif packs >= 6:
                    a["category"] = "bundle"
                else:
                    a["category"] = "booster_pack"
                box_ev_avg = round(pack_ev * packs, 2)
                box_ev_mid90 = round(pack_mid * packs, 2)
            elif contents and isinstance(contents, dict) and (contents.get("deck") or contents.get("variable") or contents.get("card")):
                # 2. Product with deck, variable slots, or guaranteed cards (e.g. Signature Spellbooks, Commander decks)
                # Pack count is 1 unit, and the EV is the unit EV (NEVER multiplied by 36)
                a["packCount"] = 1
                a["category"] = "deck" if contents.get("deck") else "box_set"
                a["boosterName"] = "default"
                box_ev_avg = pack_ev
                box_ev_mid90 = pack_mid
            else:
                # 3. Fallback when contents JSON is not populated in DB row
                if any(w in name_lower for w in ["signature spellbook", "spellbook"]):
                    a["category"] = "box_set"
                    a["packCount"] = 1
                    a["boosterName"] = "spellbook"
                    box_ev_avg = pack_ev
                    box_ev_mid90 = pack_mid
                elif any(w in name_lower for w in ["theme booster", "sample pack", "jumpstart booster", "welcome booster", "promo pack"]) or sp_cat == "booster_pack":
                    a["category"] = "booster_pack"
                    a["packCount"] = 1
                    box_ev_avg = pack_ev
                    box_ev_mid90 = pack_mid
                elif any(w in name_lower for w in [
                    "theme deck", "planeswalker deck", "sample deck", "commander", "duel deck",
                    "challenger deck", "intro pack", "clash pack", "starter deck", "event deck",
                    "brawl deck", "starter kit", "starter set", "two player starter", "2-player starter",
                    "game night", "battle pack"
                ]) or sp_cat in ["deck", "multiple_decks", "kit"]:
                    a["category"] = "deck"
                    a["packCount"] = 1
                    box_ev_avg = pack_ev
                    box_ev_mid90 = pack_mid
                elif any(w in name_lower for w in ["secret lair", "from the vault", "premium deck"]) or sp_cat == "box_set":
                    a["category"] = "box_set"
                    a["packCount"] = 1
                    box_ev_avg = pack_ev
                    box_ev_mid90 = pack_mid
                elif "prerelease" in name_lower:
                    a["category"] = "bundle"
                    a["packCount"] = 6
                    box_ev_avg = round(pack_ev * 6, 2)
                    box_ev_mid90 = round(pack_mid * 6, 2)
                elif any(w in name_lower for w in ["bundle", "fat pack", "gift edition"]) or sp_cat == "bundle":
                    a["category"] = "bundle"
                    a["packCount"] = 9
                    box_ev_avg = round(pack_ev * 9, 2)
                    box_ev_mid90 = round(pack_mid * 9, 2)
                elif any(w in name_lower for w in ["collector booster box", "collector display"]):
                    a["category"] = "booster_box"
                    a["packCount"] = 12
                    box_ev_avg = round(pack_ev * 12, 2)
                    box_ev_mid90 = round(pack_mid * 12, 2)
                elif "jumpstart" in name_lower and ("box" in name_lower or "display" in name_lower):
                    a["category"] = "booster_box"
                    a["packCount"] = 24
                    box_ev_avg = round(pack_ev * 24, 2)
                    box_ev_mid90 = round(pack_mid * 24, 2)
                elif any(w in name_lower for w in ["booster box", "display", "play booster box", "draft booster box", "set booster box"]) or sp_cat == "booster_box":
                    a["category"] = "booster_box"
                    a["packCount"] = 36
                    box_ev_avg = round(pack_ev * 36, 2)
                    box_ev_mid90 = round(pack_mid * 36, 2)
                elif "case" in name_lower or sp_cat == "booster_case":
                    a["category"] = "booster_case"
                    a["packCount"] = 216
                    box_ev_avg = round(pack_ev * 216, 2)
                    box_ev_mid90 = round(pack_mid * 216, 2)
                else:
                    # Generic single product
                    a["category"] = "other"
                    a["packCount"] = 1
                    box_ev_avg = pack_ev
                    box_ev_mid90 = pack_mid

            # If box price is missing, provide reasonable estimate
            if box_price <= 0 and box_ev_avg > 0:
                box_price = round(box_ev_avg * 0.95, 2)
                a['boxMarketPrice'] = box_price

            profit_usd = round(box_ev_avg - box_price, 2) if box_price > 0 else 0.0
            roi_pct = round((profit_usd / box_price) * 100, 2) if box_price > 0 else 0.0

            # Clean temporary helper keys
            a.pop('spCategory', None)
            a.pop('spSubtype', None)
            a.pop('spCardCount', None)

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
