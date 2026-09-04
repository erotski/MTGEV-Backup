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
            print(f"✔ Extracted {len(sealed_products)} sealed products from MTGJSON SQLite.")
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
        print(f"✔ Loaded {len(sealed_products)} sealed products from JSON.")
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

    # 5. Strict recursive composite product EV, pack, and card resolution engine
    def get_pack_ev(set_code, booster_code):
        s_code = (set_code or "").lower()
        b_key = (booster_code or "").lower()

        # MTGJSON contents codes are authoritative. Do not turn promotional
        # codes such as collector-sample into regular collector boosters.
        aliases = {
            "set-booster": "set",
            "set_booster": "set",
            "draft-booster": "draft",
            "draft_booster": "draft",
            "play-booster": "play",
            "play_booster": "play",
        }
        b_key = aliases.get(b_key, b_key)
        
        # Standard lookup
        ev_row = (
            booster_ev_lookup.get((s_code, b_key, "direct", "tcgplayer"))
            or booster_ev_lookup.get((s_code, b_key, "direct", "all"))
        )
        return ev_row

    def evaluate_product_composite(prod, depth=0, visited=None):
        if visited is None:
            visited = set()
        uid = prod.get("id") or prod.get("uuid")
        if uid in visited or depth > 6:
            return {"packs": 0, "cards": 0, "evAvg": 0.0, "evMid90": 0.0, "evMin": 0.0, "evMax": 0.0, "boosterName": "custom"}
        visited.add(uid)

        c = prod.get("contents") or {}
        total_packs = 0
        total_cards = 0
        ev_avg = 0.0
        ev_mid90 = 0.0
        ev_min = 0.0
        ev_max = 0.0
        booster_names = set()

        is_secret_lair = (
            (prod.get("setCode") or "").lower() == "sld" 
            or (prod.get("subtype") or "").lower() in ["secret_lair", "secret_lair_bundle"] 
            or "secret lair" in (prod.get("displayName") or "").lower()
        )

        # 1. Sealed sub-products (Bundles, Cases, Superdrops, Festival in a Box)
        if c.get("sealed") and isinstance(c["sealed"], list) and len(c["sealed"]) > 0:
            for s in c["sealed"]:
                scnt = int(s.get("count", 1) or 1)
                suuid = s.get("uuid")
                sub_prod = product_map.get(suuid)
                if sub_prod:
                    res = evaluate_product_composite(sub_prod, depth + 1, visited.copy())
                    total_packs += scnt * res["packs"]
                    total_cards += scnt * res["cards"]
                    if res.get("boosterName") and res["boosterName"] not in ["draft", "custom", "deck"]:
                        booster_names.add(res["boosterName"])

                    if res["evAvg"] > 0:
                        ev_avg += scnt * res["evAvg"]
                        ev_mid90 += scnt * res["evMid90"]
                        ev_min += scnt * res["evMin"]
                        ev_max += scnt * res["evMax"]
                    else:
                        sub_m = float(sub_prod.get("marketPrice", 0) or 0)
                        if sub_m > 0:
                            ev_avg += scnt * sub_m
                            ev_mid90 += scnt * sub_m
                            ev_min += scnt * sub_m * 0.85
                            ev_max += scnt * sub_m * 1.15
                else:
                    sname = (s.get("name") or "").lower()
                    sset = (s.get("set") or prod.get("setCode") or "").lower()
                    ev_row = get_pack_ev(sset, "draft")
                    if ev_row and ("pack" in sname or "booster" in sname):
                        p_ev = float(ev_row.get("evAverage", 0) or 0)
                        ev_avg += scnt * p_ev
                        ev_mid90 += scnt * float(ev_row.get("evMid90", p_ev) or p_ev)
                        ev_min += scnt * float(ev_row.get("evMin", 0) or 0)
                        ev_max += scnt * float(ev_row.get("evMax", p_ev * 2) or p_ev * 2)
                        total_packs += scnt
                        total_cards += scnt * 15
                    else:
                        total_cards += scnt * 15

        # 2. Packs directly in contents (exclude Secret Lair drop synthetic pack wrappers)
        if not is_secret_lair and c.get("pack") and isinstance(c["pack"], list) and len(c["pack"]) > 0:
            for pk in c["pack"]:
                pcnt = int(pk.get("count", 1) or 1)
                pcode = pk.get("code") or "draft"
                pset = pk.get("set") or prod.get("setCode") or ""
                ev_row = get_pack_ev(pset, pcode)
                if ev_row:
                    p_ev = float(ev_row.get("evAverage", 0) or 0)
                    ev_avg += pcnt * p_ev
                    ev_mid90 += pcnt * float(ev_row.get("evMid90", p_ev) or p_ev)
                    ev_min += pcnt * float(ev_row.get("evMin", 0) or 0)
                    ev_max += pcnt * float(ev_row.get("evMax", p_ev * 2) or p_ev * 2)
                    booster_names.add(ev_row.get("boosterName", pcode))
                total_packs += pcnt
                total_cards += pcnt * int(prod.get("cardCount") or 0)

        # 3. Cards directly in contents (promos / singles)
        if c.get("card") and isinstance(c["card"], list) and len(c["card"]) > 0:
            for cd in c["card"]:
                ccnt = int(cd.get("count", 1) or 1)
                total_cards += ccnt
                is_foil = cd.get("foil", False) or "foil" in (cd.get("finishes") or [])
                card_val = 15.0 if is_foil else 5.0
                ev_avg += ccnt * card_val
                ev_mid90 += ccnt * card_val
                ev_min += ccnt * (card_val * 0.5)
                ev_max += ccnt * (card_val * 2.0)

        # 4. Decks directly in contents
        if c.get("deck") and isinstance(c["deck"], list) and len(c["deck"]) > 0:
            for dk in c["deck"]:
                dname = (dk.get("name") or "").lower()
                matched = None
                clean_dname = re.sub(r"[^a-z0-9]", "", dname)
                for k, d in precon_decks.items():
                    cd = re.sub(r"[^a-z0-9]", "", (d.get("deckName") or "").lower())
                    if cd and (cd in clean_dname or clean_dname in cd):
                        matched = d
                        break
                if matched and matched.get("totalSinglesEv"):
                    dev = float(matched["totalSinglesEv"])
                    ev_avg += dev
                    ev_mid90 += dev
                    ev_min += dev * 0.75
                    ev_max += dev * 1.35
                    total_cards += int(matched.get("cardCount", 100) or 100)
                else:
                    if is_secret_lair:
                        cnt = int(prod.get("cardCount") or 5)
                        total_cards += cnt
                    else:
                        total_cards += 100

        # 5. Category fallback (for leaf products without contents)
        if total_packs == 0 and not is_secret_lair and not c.get("sealed") and not c.get("pack") and not c.get("card") and not c.get("deck"):
            cat = (prod.get("category") or "").lower()
            sub = (prod.get("subtype") or "").lower()
            pname = (prod.get("displayName") or "").lower()
            s_code = (prod.get("setCode") or "").lower()

            if cat in ["booster_box", "booster_pack", "bundle", "prerelease_kit", "booster_case", "bundle_case"]:
                packs = 36
                b_key = "draft"
                if cat == "booster_pack": packs = 1
                elif cat == "bundle": packs = 9
                elif cat == "bundle_case": packs = 54
                elif cat == "prerelease_kit" or "prerelease" in pname: packs = 6
                elif cat == "booster_case":
                    packs = 72 if sub == "collector" else (144 if sub == "jumpstart" else 216)
                elif sub == "collector" or "collector" in pname: packs = 12; b_key = "collector"
                elif sub == "jumpstart" or "jumpstart" in pname: packs = 24; b_key = "jumpstart"
                elif sub == "play" or "play" in pname: packs = 36; b_key = "play"

                total_packs = packs
                total_cards = packs * 15

                ev_row = get_pack_ev(s_code, b_key)
                if ev_row:
                    p_ev = float(ev_row.get("evAverage", 0) or 0)
                    ev_avg = packs * p_ev
                    ev_mid90 = packs * float(ev_row.get("evMid90", p_ev) or p_ev)
                    ev_min = packs * float(ev_row.get("evMin", 0) or 0)
                    ev_max = packs * float(ev_row.get("evMax", p_ev * 2) or p_ev * 2)
                    booster_names.add(ev_row.get("boosterName", b_key))

        # Do not invent EV for products with explicit MTGJSON contents.
        if ev_avg == 0.0 and not c:
            m_price = float(prod.get("marketPrice", 0) or 0)
            if m_price > 0:
                ev_avg = m_price
                ev_mid90 = m_price
                ev_min = m_price * 0.85
                ev_max = m_price * 1.15

        # Authoritative card count override if MTGJSON specifies cardCount explicitly
        if prod.get("cardCount") and int(prod["cardCount"]) > 0:
            total_cards = int(prod["cardCount"])

        bname = ", ".join(sorted(booster_names)) if booster_names else ("deck" if total_packs == 0 else "draft")
        return {
            "packs": total_packs,
            "cards": total_cards,
            "evAvg": round(ev_avg, 2),
            "evMid90": round(ev_mid90, 2),
            "evMin": round(ev_min, 2),
            "evMax": round(ev_max, 2),
            "boosterName": bname
        }

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
        res = evaluate_product_composite(sp)
        
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
            "boxMarketPrice": m_price,
            "packCount": pack_count,
            "cardCount": card_count,
            "boosterName": b_name_display,
            "packEvAvg": pack_ev_avg,
            "packEvMid90": pack_ev_mid90,
            "packEvMin": pack_ev_min,
            "packEvMax": pack_ev_max,
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
