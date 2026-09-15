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
    print(">> 1. Exporting sets.json...")
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
    print(">> 2. Exporting sealed_products.json...")
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
    print(">> 3. Exporting booster_ev.json...")
    ev_results = []
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
                quantiles,
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

        for r in ev_results:
            if r.get("quantiles") and isinstance(r["quantiles"], str):
                try:
                    r["quantiles"] = json.loads(r["quantiles"])
                except Exception:
                    r["quantiles"] = []

        with open(OUTPUT_DIR / "booster_ev.json", "w", encoding="utf-8") as f:
            json.dump(ev_results, f, indent=2, default=str)
        print(f"  ✔ Exported {len(ev_results)} booster EV simulations")
    except Exception as e:
        print(f"  ✘ Error exporting booster EV results: {e}")

    # 3b. Export weighted booster pricing reliability by named vendor.
    print(">> 3b. Exporting pricing_reliability.json...")
    try:
        named_vendors = {"tcgplayer", "cardmarket", "cardkingdom", "manapool"}
        reliability = {}
        for row in ev_results:
            vendor = str(row.get("vendor") or "").lower()
            if vendor not in named_vendors:
                continue
            key = f"{vendor}:{row.get('priceMode') or 'direct'}"
            weight = int(row.get("simulatedPacks") or 0)
            if weight <= 0:
                continue
            aggregate = reliability.setdefault(key, {
                "vendor": vendor,
                "priceMode": row.get("priceMode") or "direct",
                "simulatedPacks": 0,
                "completeBoosterPct": 0.0,
                "resolutionPct": 0.0,
                "differentFinishPct": 0.0,
                "differentVendorPct": 0.0,
                "sourceRows": 0,
            })
            aggregate["simulatedPacks"] += weight
            aggregate["sourceRows"] += 1
            for field in ("completeBoosterPct", "differentFinishPct", "differentVendorPct"):
                aggregate[field] += float(row.get(field) or 0.0) * weight
            if aggregate["priceMode"] == "direct":
                aggregate["resolutionPct"] += float(row.get("exactMatchPct") or 0.0) * weight
            else:
                aggregate["resolutionPct"] += float(row.get("completeBoosterPct") or 0.0) * weight

        for aggregate in reliability.values():
            weight = aggregate["simulatedPacks"]
            for field in ("completeBoosterPct", "resolutionPct", "differentFinishPct", "differentVendorPct"):
                aggregate[field] = round(aggregate[field] / weight, 2)
            if aggregate["priceMode"] == "direct":
                aggregate["directExactPct"] = aggregate["resolutionPct"]
                aggregate["nonExactPct"] = round(100.0 - aggregate["directExactPct"], 2)
            else:
                aggregate["reprintResolvedPct"] = aggregate["resolutionPct"]
                aggregate["unresolvedPct"] = round(100.0 - aggregate["reprintResolvedPct"], 2)
            del aggregate["resolutionPct"]

        with open(OUTPUT_DIR / "pricing_reliability.json", "w", encoding="utf-8") as f:
            json.dump({"vendors": reliability}, f, indent=2)
        print(f"  ✔ Exported reliability for {len(reliability)} vendor/mode combinations")
    except Exception as e:
        print(f"  ✘ Error exporting pricing reliability: {e}")

    # 4. Generate & Export Full Arbitrage Leaderboard (Box, Pack, Bundle, Decks)
    print(">> 4. Exporting arbitrage_leaderboard.json...")
    try:
        # Pre-load quantiles from existing sealed_products.json if available
        sp_quantiles_lookup = {}
        sp_file = OUTPUT_DIR / "sealed_products.json"
        if sp_file.exists():
            try:
                with open(sp_file, "r", encoding="utf-8") as spf:
                    sp_list = json.load(spf)
                    for sp_item in sp_list:
                        sp_id = sp_item.get("id") or sp_item.get("uuid")
                        if sp_id:
                            sp_quantiles_lookup[sp_id] = {
                                "quantilesByVendor": sp_item.get("quantilesByVendor"),
                                "archetype": sp_item.get("archetype"),
                                "breakevenPercentile": sp_item.get("breakevenPercentile"),
                                "evScore": sp_item.get("evScore"),
                            }
            except Exception as e:
                print(f"  [WARN] Reading existing sealed_products.json quantiles: {e}")

        # Pre-load booster EV lookup by (set_code, booster_name)
        cursor.execute("""
            SELECT set_code, booster_name, ev_average, ev_mid90, ev_min, ev_max, exact_match_pct, updated_at
            FROM booster_ev_results
            WHERE price_mode = 'direct' AND vendor = 'all_cheapest' AND ev_average > 0;
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
                spp.market_price as marketPrice,
                sp.contents as contents
            FROM sealedProducts sp
            JOIN sets s ON sp.setCode = s.code
            JOIN sealedproducts_prices spp ON sp.uuid = spp.sealedproduct_uuid
            WHERE spp.market_price IS NOT NULL AND spp.market_price > 0
            ORDER BY sp.setCode, sp.name;
        """)
        arbs = cursor.fetchall()

        # Build product map for recursive hierarchy resolution
        product_map = {}
        for a in arbs:
            raw_c = a.get("contents")
            c_parsed = None
            if raw_c and isinstance(raw_c, str):
                try:
                    c_parsed = json.loads(raw_c)
                except Exception:
                    c_parsed = None
            elif isinstance(raw_c, dict):
                c_parsed = raw_c
            product_map[a.get("productUuid")] = {
                "id": a.get("productUuid"),
                "displayName": a.get("boxName"),
                "category": a.get("spCategory"),
                "subtype": a.get("spSubtype"),
                "cardCount": a.get("spCardCount"),
                "contents": c_parsed,
            }

        def resolve_product_packs_recursive(prod_id, visited=None):
            if visited is None:
                visited = set()
            if prod_id in visited:
                return 0, None
            visited.add(prod_id)

            prod = product_map.get(prod_id)
            if not prod:
                return 0, None

            c = prod.get("contents")
            if c and isinstance(c, dict):
                # 1. Sealed items (primary authority for boxes, cases, prerelease packs, bundles)
                if c.get("sealed") and isinstance(c["sealed"], list):
                    total_packs = 0
                    b_code = None
                    for s in c["sealed"]:
                        s_count = int(s.get("count", 1) or 1)
                        child_uuid = s.get("uuid")
                        if child_uuid and child_uuid in product_map:
                            cp_count, cp_code = resolve_product_packs_recursive(child_uuid, visited.copy())
                            total_packs += s_count * cp_count
                            if not b_code and cp_code:
                                b_code = cp_code
                        else:
                            c_name = (s.get("name") or "").lower()
                            if "pack" in c_name or "booster" in c_name:
                                total_packs += s_count * 1
                            elif "box" in c_name:
                                total_packs += s_count * 36
                            else:
                                total_packs += s_count * 1
                    if total_packs > 0:
                        if not b_code and c.get("pack") and isinstance(c["pack"], list) and len(c["pack"]) > 0:
                            b_code = c["pack"][0].get("code")
                        return total_packs, b_code

                # 2. Pack array (direct packs)
                if c.get("pack") and isinstance(c["pack"], list):
                    total_packs = 0
                    b_code = None
                    for pk in c["pack"]:
                        cnt = int(pk.get("count", 1) or 1)
                        total_packs += cnt
                        if not b_code and pk.get("code"):
                            b_code = pk.get("code")
                    if total_packs > 0:
                        return total_packs, b_code

            return 0, None

        # Collect card UUIDs from contents to query prices
        card_uuids = set()
        for a in arbs:
            raw_c = a.get("contents")
            if raw_c:
                try:
                    c_obj = json.loads(raw_c) if isinstance(raw_c, str) else raw_c
                    if c_obj and isinstance(c_obj, dict) and c_obj.get("card"):
                        for cd in c_obj["card"]:
                            if cd.get("uuid"):
                                card_uuids.add(cd["uuid"])
                except Exception:
                    pass

        card_prices_lookup = {}
        if card_uuids:
            try:
                placeholders = ', '.join(['%s'] * len(card_uuids))
                cursor.execute(f"""
                    SELECT uuid, provider, finish, price
                    FROM prices
                    WHERE uuid IN ({placeholders})
                      AND (source = 'paper' OR source IS NULL)
                      AND (priceType = 'retail' OR priceType IS NULL)
                      AND price > 0;
                """, tuple(card_uuids))
                for row in cursor.fetchall():
                    u = row["uuid"]
                    prov = (row.get("provider") or "").lower()
                    fin = (row.get("finish") or "").lower()
                    pr = float(row.get("price") or 0.0)
                    if u not in card_prices_lookup:
                        card_prices_lookup[u] = {}
                    if prov not in card_prices_lookup[u]:
                        card_prices_lookup[u][prov] = {}
                    card_prices_lookup[u][prov][fin] = pr
            except Exception as e:
                print(f"[WARN] Could not fetch card prices from DB: {e}")

        EUR_USD_RATE = 1.09

        def resolve_card_prices(u, finishes, is_foil):
            card_p = card_prices_lookup.get(u, {})
            want_foil = is_foil or ('foil' in (finishes or []) and 'nonfoil' not in (finishes or []))
            res = {}

            # TCGplayer
            tcg = card_p.get('tcgplayer', {})
            p_tcg = tcg.get('foil') if want_foil else tcg.get('normal')
            if p_tcg:
                res['tcgplayer'] = round(float(p_tcg), 2)

            # Card Kingdom
            ck = card_p.get('cardkingdom', {})
            p_ck = ck.get('foil') if want_foil else ck.get('normal')
            if p_ck:
                res['cardkingdom'] = round(float(p_ck), 2)

            # Cardmarket
            cm = card_p.get('cardmarket', {})
            p_cm = cm.get('foil') if want_foil else cm.get('normal')
            if p_cm:
                res['cardmarket'] = round(float(p_cm) * EUR_USD_RATE, 2)
                res['cardmarketEur'] = round(float(p_cm), 2)

            # Manapool
            mp = card_p.get('manapool', {})
            p_mp = mp.get('foil') if want_foil else mp.get('normal')
            if p_mp:
                res['manapool'] = round(float(p_mp), 2)

            valid_vals = [v for k, v in res.items() if k in ['tcgplayer', 'cardkingdom', 'cardmarket', 'manapool'] and v is not None and v > 0]
            if valid_vals:
                res['all_cheapest'] = round(min(valid_vals), 2)
                res['all_average'] = round(sum(valid_vals) / len(valid_vals), 2)

            return res

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
            sp_card_count = a.get("spCardCount")
            set_code = (a.get("setCode") or "").upper()
            box_price = float(a.get("marketPrice") or 0.0)

            if box_price <= 0:
                continue

            # Enrich contents.card with genuine resolved prices across sellers
            if contents and isinstance(contents, dict) and contents.get("card"):
                for cd in contents["card"]:
                    u = cd.get("uuid")
                    if u:
                        cd["prices"] = resolve_card_prices(u, cd.get("finishes"), cd.get("foil", False))

            # Determine genuine pack count via recursive sealed hierarchy
            pack_count, resolved_booster_code = resolve_product_packs_recursive(a.get("productUuid"))
            card_count = None

            if contents and isinstance(contents, dict) and contents.get("card"):
                card_count = len(contents["card"])

            if sp_card_count is not None and str(sp_card_count).isdigit() and int(sp_card_count) > 0:
                card_count = int(sp_card_count)

            # Non-booster products (like single-card promos, box sets, or decks):
            if pack_count <= 0:
                if contents and isinstance(contents, dict) and contents.get("card"):
                    cards = contents["card"]
                    singles_ev = sum(cd.get("prices", {}).get("tcgplayer", cd.get("prices", {}).get("all_cheapest", 0.0)) for cd in cards)
                    if singles_ev > 0:
                        a.pop('spCategory', None)
                        a.pop('spSubtype', None)
                        a.pop('spCardCount', None)
                        a['category'] = sp_cat if sp_cat in ["box_set", "deck"] else "other"
                        a['boosterName'] = "single_card"
                        a['packCount'] = 0
                        a['cardCount'] = len(cards)
                        a['unitEvMin'] = 0.0
                        a['unitEvAvg'] = 0.0
                        a['unitEvMid90'] = 0.0
                        a['unitEvMax'] = 0.0
                        a['completePct'] = 100.0
                        a['updatedAt'] = ""
                        a['contents'] = contents
                        a['totalEvMin'] = round(singles_ev, 2)
                        a['totalEvAvg'] = round(singles_ev, 2)
                        a['totalEvMid90'] = round(singles_ev, 2)
                        a['totalEvMax'] = round(singles_ev, 2)
                        profit = round(singles_ev - box_price, 2)
                        roi = round((profit / box_price) * 100, 2) if box_price > 0 else 0.0
                        a['profitUsd'] = profit
                        a['roiPct'] = roi
                        a['vendor'] = 'tcgplayer'
                        a['priceMode'] = 'direct'
                        valid_arbs.append(a)
                continue

            set_boosters = ev_by_set.get(set_code, {})
            if not set_boosters:
                continue

            # Booster selection
            matched_booster = None
            if resolved_booster_code and resolved_booster_code in set_boosters:
                matched_booster = resolved_booster_code
            elif resolved_booster_code:
                # Explicit MTGJSON pack code has no matching simulation.
                # Do not substitute a different booster type.
                continue
            elif sp_sub in set_boosters:
                matched_booster = sp_sub
            elif sp_cat == "booster_box" and "play" in set_boosters:
                matched_booster = "play"
            elif sp_cat == "booster_box" and "draft" in set_boosters:
                matched_booster = "draft"
            elif "default" in set_boosters:
                matched_booster = "default"
            elif len(set_boosters) == 1:
                matched_booster = next(iter(set_boosters))

            if not matched_booster or matched_booster not in set_boosters:
                continue

            ev_info = set_boosters[matched_booster]
            pack_ev = float(ev_info.get("ev_average") or 0.0)
            pack_mid = float(ev_info.get("ev_mid90") or 0.0)
            pack_min = float(ev_info.get("ev_min") or 0.0)
            pack_max = float(ev_info.get("ev_max") or 0.0)

            if pack_ev <= 0 or pack_count <= 0:
                continue

            box_ev_min = round(pack_min * pack_count, 2)
            box_ev_avg = round(pack_ev * pack_count, 2)
            box_ev_mid90 = round(pack_mid * pack_count, 2)
            box_ev_max = round(pack_max * pack_count, 2)
            profit_usd = round(box_ev_avg - box_price, 2)
            roi_pct = round((profit_usd / box_price) * 100, 2)

            # Clean temporary helper keys
            a.pop('spCategory', None)
            a.pop('spSubtype', None)
            a.pop('spCardCount', None)

            a['category'] = sp_cat if sp_cat in ["booster_box", "booster_case", "booster_pack", "bundle", "deck", "box_set"] else "other"
            a['boosterName'] = matched_booster
            a['packCount'] = pack_count
            a['unitEvMin'] = pack_min
            a['unitEvAvg'] = pack_ev
            a['unitEvMid90'] = pack_mid
            a['unitEvMax'] = pack_max
            a['completePct'] = float(ev_info.get("exact_match_pct", 100.0) or 100.0)
            a['updatedAt'] = str(ev_info.get("updated_at") or "")
            a['contents'] = contents
            a['totalEvMin'] = box_ev_min
            a['totalEvAvg'] = box_ev_avg
            a['totalEvMid90'] = box_ev_mid90
            a['totalEvMax'] = box_ev_max
            a['profitUsd'] = profit_usd
            a['roiPct'] = roi_pct
            a['vendor'] = 'tcgplayer'
            a['priceMode'] = 'direct'

            # Attach pre-computed quantiles if available
            p_uuid = a.get("productUuid") or a.get("id")
            if p_uuid and p_uuid in sp_quantiles_lookup:
                q_data = sp_quantiles_lookup[p_uuid]
                if q_data.get("quantiles"):
                    a['quantiles'] = q_data['quantiles']
                if q_data.get("quantilesByVendor"):
                    a['quantilesByVendor'] = q_data['quantilesByVendor']
                if q_data.get("archetype"):
                    a['archetype'] = q_data['archetype']
                if q_data.get("breakevenPercentile"):
                    a['breakevenPercentile'] = q_data['breakevenPercentile']
                if q_data.get("evScore"):
                    a['evScore'] = q_data['evScore']

            valid_arbs.append(a)

        # Sort by best ROI
        valid_arbs.sort(key=lambda x: x['roiPct'], reverse=True)

        with open(OUTPUT_DIR / "arbitrage_leaderboard.json", "w", encoding="utf-8") as f:
            json.dump(valid_arbs, f, indent=2, default=str)
        print(f"  ✔ Exported {len(valid_arbs)} product arbitrage opportunities")
    except Exception as e:
        print(f"  ✘ Error exporting arbitrage leaderboard: {e}")

    # 5. Export / Update single_card_prices.json with genuine DB prices
    print("\n>> 5. Exporting single_card_prices.json from MTGJSON prices table...")
    try:
        single_prices_file = OUTPUT_DIR / "single_card_prices.json"
        existing_single_prices = {"byUuid": {}, "byName": {}, "byNameSet": {}}
        if single_prices_file.exists():
            try:
                with open(single_prices_file, "r", encoding="utf-8") as sf:
                    existing_single_prices = json.load(sf)
            except Exception as ex:
                print(f"  [WARN] Reading existing single_card_prices.json: {ex}")

        by_uuid = existing_single_prices.get("byUuid", {})
        by_name = existing_single_prices.get("byName", {})
        by_name_set = existing_single_prices.get("byNameSet", {})

        # For each card encountered in sealed products contents
        updated_count = 0
        for a in arbs:
            contents = a.get("contents")
            if contents and isinstance(contents, dict) and contents.get("card"):
                for cd in contents["card"]:
                    u = cd.get("uuid")
                    if not u:
                        continue
                    cname = cd.get("name") or ""
                    cnum = cd.get("number") or ""
                    cset = (cd.get("set") or a.get("setCode") or "").lower()
                    finishes = cd.get("finishes") or []
                    is_foil = cd.get("foil", False) or ('foil' in finishes and 'nonfoil' not in finishes)
                    resolved_p = resolve_card_prices(u, finishes, is_foil)

                    p_val = resolved_p.get("tcgplayer") or resolved_p.get("all_cheapest") or resolved_p.get("cardkingdom") or 0.0
                    if p_val > 0:
                        card_entry = {
                            "name": cname,
                            "set": cset,
                            "number": str(cnum),
                            "uuid": u,
                            "price": p_val,
                            "ev": p_val,
                            "prices": resolved_p,
                            "foil": is_foil,
                            "finishes": finishes,
                        }
                        by_uuid[u] = card_entry
                        if cname:
                            by_name[cname.lower()] = card_entry
                            by_name_set[f"{cname.lower()}___{cset}"] = card_entry
                            by_name_set[f"{cname.lower()}_{cset}"] = card_entry
                        updated_count += 1

        # Normalize the legacy "all" vendor-price alias to the canonical
        # "all_cheapest" key across every indexed record, including entries
        # seeded by one-off ingestion scripts that this loop never re-touches.
        normalized_count = 0
        for indexed in (by_uuid, by_name, by_name_set):
            for entry in indexed.values():
                prices = entry.get("prices")
                if not isinstance(prices, dict) or "all" not in prices:
                    continue
                prices.setdefault("all_cheapest", prices["all"])
                del prices["all"]
                normalized_count += 1
        if normalized_count:
            print(f"  ✔ Normalized {normalized_count} legacy 'all' vendor price keys to 'all_cheapest'")

        existing_single_prices["byUuid"] = by_uuid
        existing_single_prices["byName"] = by_name
        existing_single_prices["byNameSet"] = by_name_set

        with open(single_prices_file, "w", encoding="utf-8") as sf:
            json.dump(existing_single_prices, sf, indent=2)

        dist_single_prices = Path(__file__).resolve().parent.parent / "dist" / "data"
        if dist_single_prices.exists():
            with open(dist_single_prices / "single_card_prices.json", "w", encoding="utf-8") as sf:
                json.dump(existing_single_prices, sf, indent=2)

        print(f"  ✔ Exported single_card_prices.json with {updated_count} cards updated from MTGJSON DB ({len(by_uuid)} total indexed)")
    except Exception as e:
        print(f"  ✘ Error exporting single_card_prices.json: {e}")

    cursor.close()
    conn.close()
    print("\n[SUCCESS] Pipeline export complete. Ready for React frontend deployment!")

if __name__ == "__main__":
    export_all()
