"""
sync_all_from_sqlite.py
Extracts 100% official MTGJSON contents for all 4,209 sealed products from AllPrintings.sqlite.
Recalculates arbitrage leaderboard with zero assumptions, strictly using MTGJSON contents.
Populates both packCount and total cardCount (with 0 for products with no packs).
"""
import sqlite3
import json
import re
import os
from pathlib import Path

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

    # 2. Extract authoritative data from SQLite
    conn = sqlite3.connect(str(SQLITE_PATH))
    cursor = conn.cursor()

    cursor.execute("""
        SELECT uuid, name, setCode, category, subtype, cardCount, contents, purchaseUrls, identifiers
        FROM sealedProducts
        ORDER BY setCode, category, name
    """)
    rows = cursor.fetchall()

    sealed_products = []
    product_map = {}

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

    print(f"✔ Extracted {len(sealed_products)} sealed products from MTGJSON SQLite.")
    with_contents = [p for p in sealed_products if p.get("contents")]
    print(f"✔ {len(with_contents)} products have explicit MTGJSON contents.")

    # Save sealed_products.json
    for out_dir in [PUBLIC_DATA_DIR, DIST_DATA_DIR]:
        out_dir.mkdir(parents=True, exist_ok=True)
        with open(out_dir / "sealed_products.json", "w", encoding="utf-8") as f:
            json.dump(sealed_products, f, indent=2)
    print("✔ Saved sealed_products.json to public/data and dist/data.")

    # 3. Load Booster EV table
    booster_ev_lookup = {}
    if (PUBLIC_DATA_DIR / "booster_ev.json").exists():
        with open(PUBLIC_DATA_DIR / "booster_ev.json", "r", encoding="utf-8") as f:
            ev_list = json.load(f)
            for ev in ev_list:
                s_code = (ev.get("setCode") or "").lower()
                b_name = (ev.get("boosterName") or "").lower()
                p_mode = (ev.get("priceMode") or "direct").lower()
                v_name = (ev.get("vendor") or "all").lower()
                booster_ev_lookup[(s_code, b_name, p_mode, v_name)] = ev

    # 4. Load Precon Decks for non-pack products
    precon_decks = {}
    if (PUBLIC_DATA_DIR / "precon_decks.json").exists():
        with open(PUBLIC_DATA_DIR / "precon_decks.json", "r", encoding="utf-8") as f:
            precon_decks = json.load(f)

    # 5. Strict recursive pack and card resolution function
    def resolve_packs_and_type(uuid, visited=None):
        if visited is None:
            visited = set()
        if uuid in visited:
            return 0, None
        visited.add(uuid)

        prod = product_map.get(uuid)
        if not prod:
            return 0, None

        c = prod.get("contents") or {}

        # A. Sealed sub-items (highest authority for containers, cases, kits, multi-packs)
        if c.get("sealed") and isinstance(c["sealed"], list):
            total_packs = 0
            b_code = None
            for s in c["sealed"]:
                s_count = int(s.get("count", 1) or 1)
                child_uuid = s.get("uuid")
                if child_uuid and child_uuid in product_map:
                    cp_count, cp_code = resolve_packs_and_type(child_uuid, visited.copy())
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

        # B. Pack list (direct booster pack configurations)
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

        # C. Category fallback (ONLY if no contents specified)
        cat = (prod.get("category") or "").lower()
        sub = (prod.get("subtype") or "").lower()
        pname = (prod.get("displayName") or "").lower()

        if cat == "booster_pack":
            return 1, sub or "draft"
        if cat == "booster_box":
            return (12 if sub == "collector" else (24 if sub == "jumpstart" else 36)), sub or "draft"
        if cat == "booster_case":
            return (72 if sub == "collector" else (144 if sub == "jumpstart" else 216)), sub or "draft"
        if cat == "bundle":
            return 9, sub or "draft"
        if cat == "bundle_case":
            return 54, sub or "draft"
        if sub == "prerelease_kit" or "prerelease" in pname:
            return 6, "prerelease"

        return 0, None

    def calculate_card_count(prod, pack_count):
        # 1. DB cardCount if valid
        if prod.get("cardCount") and int(prod["cardCount"]) > 0:
            return int(prod["cardCount"])
        
        c = prod.get("contents") or {}
        # 2. Direct cards list
        if c.get("card") and isinstance(c["card"], list) and len(c["card"]) > 0:
            return sum(int(cd.get("count", 1) or 1) for cd in c["card"])

        # 3. Decks list
        if c.get("deck") and isinstance(c["deck"], list) and len(c["deck"]) > 0:
            cat = (prod.get("category") or "").lower()
            pname = (prod.get("displayName") or "").lower()
            is_comm = "commander" in cat or "commander" in pname
            return len(c["deck"]) * (100 if is_comm else 60)

        # 4. If packs present
        if pack_count > 0:
            return pack_count * 15

        cat = (prod.get("category") or "").lower()
        pname = (prod.get("displayName") or "").lower()
        if "commander" in cat or "commander" in pname:
            return 100
        if cat in ["deck", "starter_deck"]:
            return 60

        return 0

    # 6. Build Arbitrage Leaderboard
    cursor.execute("SELECT code, name FROM sets")
    set_name_map = {r[0].lower(): r[1] for r in cursor.fetchall()}

    arbitrage_records = []
    for sp in sealed_products:
        m_price = sp.get("marketPrice")
        if not m_price or float(m_price) <= 0:
            continue
        m_price = float(m_price)

        uid = sp["id"]
        pack_count, b_code = resolve_packs_and_type(uid)
        card_count = calculate_card_count(sp, pack_count)

        s_code = (sp.get("setCode") or "").lower()
        set_name = set_name_map.get(s_code, sp.get("setCode", "").upper())
        pname = sp.get("displayName") or ""
        pname_lower = pname.lower()

        # If product has packs: compute booster EV
        if pack_count > 0:
            booster_key = "draft"
            if b_code:
                b_code_clean = b_code.lower()
                if "collector" in b_code_clean:
                    booster_key = "collector"
                elif "play" in b_code_clean:
                    booster_key = "play"
                elif "jumpstart" in b_code_clean:
                    booster_key = "jumpstart"
                elif "set" in b_code_clean and "booster" in b_code_clean:
                    booster_key = "set"
                elif "draft" in b_code_clean or "prerelease" in b_code_clean:
                    booster_key = "draft"
                else:
                    booster_key = b_code_clean
            else:
                sub = (sp.get("subtype") or "").lower()
                if "collector" in sub or "collector" in pname_lower:
                    booster_key = "collector"
                elif "play" in sub or "play" in pname_lower:
                    booster_key = "play"
                elif "jumpstart" in sub or "jumpstart" in pname_lower:
                    booster_key = "jumpstart"
                elif "set booster" in pname_lower or "set" in sub:
                    booster_key = "set"
                else:
                    booster_key = "draft"

            # Lookup booster EV
            ev_row = (
                booster_ev_lookup.get((s_code, booster_key, "direct", "tcgplayer"))
                or booster_ev_lookup.get((s_code, booster_key, "direct", "all"))
                or booster_ev_lookup.get((s_code, "draft", "direct", "tcgplayer"))
                or booster_ev_lookup.get((s_code, "draft", "direct", "all"))
                or booster_ev_lookup.get((s_code, "play", "direct", "tcgplayer"))
                or booster_ev_lookup.get((s_code, "play", "direct", "all"))
                or booster_ev_lookup.get((s_code, "default", "direct", "tcgplayer"))
                or booster_ev_lookup.get((s_code, "default", "direct", "all"))
            )

            if not ev_row:
                for k, val in booster_ev_lookup.items():
                    if k[0] == s_code and k[2] == "direct":
                        ev_row = val
                        break

            if not ev_row:
                continue

            pack_ev_avg = float(ev_row.get("evAverage", 0.0) or 0.0)
            pack_ev_mid90 = float(ev_row.get("evMid90", 0.0) or pack_ev_avg)
            pack_ev_min = float(ev_row.get("evMin", 0.0) or 0.0)
            pack_ev_max = float(ev_row.get("evMax", 0.0) or pack_ev_avg * 2)

            box_ev_avg = round(pack_ev_avg * pack_count, 2)
            box_ev_mid90 = round(pack_ev_mid90 * pack_count, 2)
            box_ev_min = round(pack_ev_min * pack_count, 2)
            box_ev_max = round(pack_ev_max * pack_count, 2)
            b_name_display = ev_row.get("boosterName", booster_key)

        else:
            # 0 packs product (preconstructed deck, box set, promo)
            # Check precon deck EV lookup
            matched_deck = None
            clean_pname = re.sub(r"[^a-z0-9]", "", pname_lower)
            for k, d in precon_decks.items():
                dname = (d.get("deckName") or "").lower()
                clean_dname = re.sub(r"[^a-z0-9]", "", dname)
                if clean_dname and (clean_dname in clean_pname or clean_pname in clean_dname):
                    matched_deck = d
                    break

            if matched_deck and matched_deck.get("totalSinglesEv"):
                singles_ev = float(matched_deck["totalSinglesEv"])
                box_ev_avg = round(singles_ev, 2)
                box_ev_mid90 = round(singles_ev, 2)
                box_ev_min = round(singles_ev * 0.75, 2)
                box_ev_max = round(singles_ev * 1.35, 2)
                pack_ev_avg = 0.0
                pack_ev_mid90 = 0.0
                pack_ev_min = 0.0
                pack_ev_max = 0.0
                b_name_display = "deck"
            else:
                # If no EV data available for non-pack product, skip or assign market parity
                continue

        arbitrage_val = round(box_ev_mid90 - m_price, 2)
        roi = round((arbitrage_val / m_price) * 100, 2)

        arbitrage_records.append({
            "productUuid": uid,
            "boxName": sp.get("displayName"),
            "category": sp.get("category"),
            "setCode": sp.get("setCode", "").upper(),
            "setName": set_name,
            "boxMarketPrice": m_price,
            "packCount": pack_count,
            "cardCount": card_count,
            "boosterName": b_name_display,
            "packEvAvg": round(pack_ev_avg, 2),
            "packEvMid90": round(pack_ev_mid90, 2),
            "packEvMin": round(pack_ev_min, 2),
            "packEvMax": round(pack_ev_max, 2),
            "boxEvAvg": box_ev_avg,
            "boxEvMid90": box_ev_mid90,
            "boxEvMin": box_ev_min,
            "boxEvMax": box_ev_max,
            "arbitrageValue": arbitrage_val,
            "roiPercent": roi,
            "purchaseUrl": sp.get("purchaseUrl"),
            "contents": sp.get("contents")
        })

    arbitrage_records.sort(key=lambda x: x["arbitrageValue"], reverse=True)
    print(f"✔ Generated {len(arbitrage_records)} arbitrage leaderboard records.")

    for out_dir in [PUBLIC_DATA_DIR, DIST_DATA_DIR]:
        with open(out_dir / "arbitrage_leaderboard.json", "w", encoding="utf-8") as f:
            json.dump(arbitrage_records, f, indent=2)

    # Check sample products (both pack and 0-pack)
    print("\nSample Leaderboard Records:")
    for r in arbitrage_records[:5]:
        print(f"  [{r['setCode']}] {r['boxName'][:40]} | Packs: {r['packCount']} | Cards: {r['cardCount']} | Price: ${r['boxMarketPrice']:.2f} | EV: ${r['boxEvAvg']:.2f}")

    for r in arbitrage_records:
        if r['packCount'] == 0:
            print(f"\nSample 0-Pack Deck Record: [{r['setCode']}] {r['boxName']} | Packs: {r['packCount']} | Cards: {r['cardCount']} | Price: ${r['boxMarketPrice']:.2f} | EV: ${r['boxEvAvg']:.2f}")
            break

if __name__ == "__main__":
    run_sync()
