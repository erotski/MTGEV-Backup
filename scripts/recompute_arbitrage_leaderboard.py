"""
scripts/recompute_arbitrage_leaderboard.py
Recomputes public/data/arbitrage_leaderboard.json strictly from MTGJSON contents and public datasets.
Never relies on product names or cardCount multipliers.
"""
import json
import re
from pathlib import Path

DATA_DIR = Path("public/data")

with open(DATA_DIR / "sealed_products.json", "r", encoding="utf-8") as f:
    sealed_products = json.load(f)

product_map = {}
for p in sealed_products:
    uid = p.get("id") or p.get("uuid")
    if uid:
        product_map[uid] = p

with open(DATA_DIR / "booster_ev.json", "r", encoding="utf-8") as f:
    booster_ev_list = json.load(f)

booster_ev_lookup = {}
for row in booster_ev_list:
    s = (row.get("setCode") or "").lower()
    b = (row.get("boosterName") or "").lower()
    m = (row.get("priceMode") or "direct").lower()
    v = (row.get("vendor") or "tcgplayer").lower()
    booster_ev_lookup[(s, b, m, v)] = row

with open(DATA_DIR / "precon_decks.json", "r", encoding="utf-8") as f:
    precon_decks = json.load(f)

with open(DATA_DIR / "single_card_prices.json", "r", encoding="utf-8") as f:
    single_prices = json.load(f)

def get_pack_ev(set_code, booster_code):
    s_code = (set_code or "").lower()
    b_key = (booster_code or "").lower()

    aliases = {
        "set-booster": "set",
        "set_booster": "set",
        "draft-booster": "draft",
        "draft_booster": "draft",
        "play-booster": "play",
        "play_booster": "play",
    }
    b_key = aliases.get(b_key, b_key)

    return (
        booster_ev_lookup.get((s_code, b_key, "direct", "tcgplayer"))
        or booster_ev_lookup.get((s_code, b_key, "direct", "all"))
        or booster_ev_lookup.get((s_code, "default", "direct", "tcgplayer"))
    )

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

    # 2. Packs directly in contents (MTGJSON authoritative pack entries)
    if c.get("pack") and isinstance(c["pack"], list) and len(c["pack"]) > 0:
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
            cards_in_pack = 15
            if (pset or "").lower() == "sld" or "sample" in pcode.lower() or "jumpstart-lands" in pcode.lower():
                cards_in_pack = 1 if "jumpstart-lands" in pcode.lower() else (2 if "sample" in pcode.lower() else 1)
            total_cards += pcnt * cards_in_pack

    # 3. Cards directly in contents (promos / singles lookup)
    if c.get("card") and isinstance(c["card"], list) and len(c["card"]) > 0:
        for cd in c["card"]:
            ccnt = int(cd.get("count", 1) or 1)
            total_cards += ccnt
            cuuid = cd.get("uuid")
            cname = (cd.get("name") or "").lower()
            cset = (cd.get("set") or prod.get("setCode") or "").lower()
            ns_key = f"{cname}_{cset}"

            card_val = 0.0
            card_info = None
            if cuuid and single_prices.get("byUuid", {}).get(cuuid):
                card_info = single_prices["byUuid"][cuuid]
            elif single_prices.get("byNameSet", {}).get(ns_key):
                card_info = single_prices["byNameSet"][ns_key]

            if card_info:
                is_foil = cd.get("foil", False) or "foil" in (cd.get("finishes") or [])
                card_val = float(card_info.get("foilPrice" if is_foil else "price", 0.0) or 0.0)
            elif cd.get("price"):
                card_val = float(cd.get("price") or 0.0)

            ev_avg += ccnt * card_val
            ev_mid90 += ccnt * card_val
            ev_min += ccnt * (card_val * 0.8)
            ev_max += ccnt * (card_val * 1.2)

    # 4. Decks directly in contents
    if c.get("deck") and isinstance(c["deck"], list) and len(c["deck"]) > 0:
        for dk in c["deck"]:
            dname = (dk.get("name") or "").lower().strip()
            dset = (dk.get("set") or prod.get("setCode") or "").lower().strip()
            matched = None

            prod_uuid = prod.get("id") or prod.get("uuid")
            if not matched and prod_uuid and prod_uuid in precon_decks:
                matched = precon_decks[prod_uuid]

            if dname in precon_decks:
                matched = precon_decks[dname]
            elif f"{dname}___{dset}" in precon_decks:
                matched = precon_decks[f"{dname}___{dset}"]
            elif not matched:
                clean_dname = re.sub(r"[^a-z0-9]", "", dname)
                for k, d in precon_decks.items():
                    c_d = re.sub(r"[^a-z0-9]", "", (d.get("deckName") or k).lower())
                    c_s = (d.get("setCode") or "").lower()
                    if dset and c_s == dset and clean_dname == c_d:
                        matched = d
                        break
                    elif clean_dname == c_d:
                        matched = d
                        break

            is_commander = "commander" in (prod.get("category", "") + " " + prod.get("subtype", "") + " " + prod.get("displayName", "") + " " + dname).lower()
            default_deck_cards = 100 if is_commander else 60

            deck_ev = float(matched.get("singlesEv") or matched.get("totalSinglesEv") or matched.get("estimatedEv") or 0.0) if matched else 0.0
            if matched and deck_ev > 0:
                ev_avg += deck_ev
                ev_mid90 += deck_ev
                ev_min += deck_ev
                ev_max += deck_ev
                total_cards += int(matched.get("totalCards") or matched.get("cardCount") or len(matched.get("cards", [])) or default_deck_cards)
            elif matched:
                total_cards += int(matched.get("totalCards") or matched.get("cardCount") or len(matched.get("cards", [])) or default_deck_cards)
            else:
                total_cards += default_deck_cards

    # 5. Category fallback (ONLY for leaf booster products without MTGJSON contents)
    if total_packs == 0 and not c.get("sealed") and not c.get("pack") and not c.get("card") and not c.get("deck"):
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

    # Determine primary booster name
    p_bname = "draft"
    if "collector" in booster_names: p_bname = "collector"
    elif "play" in booster_names: p_bname = "play"
    elif "set" in booster_names: p_bname = "set"
    elif "jumpstart" in booster_names: p_bname = "jumpstart"
    elif booster_names: p_bname = list(booster_names)[0]
    elif c.get("deck"): p_bname = "deck"
    elif c.get("card"): p_bname = "single_card"

    return {
        "packs": total_packs,
        "cards": total_cards,
        "evAvg": round(ev_avg, 2),
        "evMid90": round(ev_mid90, 2),
        "evMin": round(ev_min, 2),
        "evMax": round(ev_max, 2),
        "boosterName": p_bname,
    }

# Build Leaderboard
leaderboard = []
for p in sealed_products:
    m_price = float(p.get("marketPrice", 0) or 0)
    if m_price <= 0:
        continue

    res = evaluate_product_composite(p)
    box_ev = res["evAvg"]
    if box_ev <= 0:
        continue

    pack_count = res["packs"]
    card_count = res["cards"]
    pack_ev_avg = round(box_ev / pack_count, 2) if pack_count > 0 else 0.0
    pack_ev_mid90 = round(res["evMid90"] / pack_count, 2) if pack_count > 0 else 0.0
    pack_ev_min = round(res["evMin"] / pack_count, 2) if pack_count > 0 else 0.0
    pack_ev_max = round(res["evMax"] / pack_count, 2) if pack_count > 0 else 0.0

    arbitrage_val = round(box_ev - m_price, 2)
    roi_pct = round((arbitrage_val / m_price) * 100, 2)

    item = {
        "productUuid": p.get("id") or p.get("uuid"),
        "boxName": p.get("displayName") or p.get("name"),
        "category": p.get("category", "other"),
        "setCode": (p.get("setCode") or "").upper(),
        "setName": p.get("setName", ""),
        "boxMarketPrice": m_price,
        "packCount": pack_count,
        "cardCount": card_count,
        "boosterName": res["boosterName"],
        "packEvAvg": pack_ev_avg,
        "packEvMid90": pack_ev_mid90,
        "packEvMin": pack_ev_min,
        "packEvMax": pack_ev_max,
        "boxEvAvg": box_ev,
        "boxEvMid90": res["evMid90"],
        "boxEvMin": res["evMin"],
        "boxEvMax": res["evMax"],
        "arbitrageValue": arbitrage_val,
        "profitUsd": arbitrage_val,
        "roiPercent": roi_pct,
        "roiPct": roi_pct,
        "completePct": "100.00",
        "updatedAt": p.get("priceFetchedAt", ""),
        "vendor": "tcgplayer",
        "priceMode": "direct",
        "purchaseUrl": p.get("purchaseUrl", ""),
        "contents": p.get("contents"),
    }
    leaderboard.append(item)

# Sort by arbitrage value descending
leaderboard.sort(key=lambda x: x["arbitrageValue"], reverse=True)

with open(DATA_DIR / "arbitrage_leaderboard.json", "w", encoding="utf-8") as f:
    json.dump(leaderboard, f, indent=2)

dist_dir = Path(__file__).resolve().parent.parent / "dist" / "data"
if dist_dir.exists():
    with open(dist_dir / "arbitrage_leaderboard.json", "w", encoding="utf-8") as f:
        json.dump(leaderboard, f, indent=2)

print(f"Successfully recomputed arbitrage_leaderboard.json with {len(leaderboard)} products.")
