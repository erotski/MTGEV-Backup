"""
ev_engine.py — Single source of truth for recursive composite product EV resolution.

Used by both backend/sync_all_from_sqlite.py and scripts/recompute_arbitrage_leaderboard.py
so the "how much is this product's contents worth" algorithm only lives in one place.
Pure functions: callers own loading/building the lookup dicts and pass them in explicitly.
"""
import re

BOOSTER_ALIASES = {
    "set-booster": "set",
    "set_booster": "set",
    "draft-booster": "draft",
    "draft_booster": "draft",
    "play-booster": "play",
    "play_booster": "play",
}


def get_pack_ev(booster_ev_lookup, set_code, booster_code, vendor="tcgplayer", price_mode="direct"):
    """Look up a booster_ev.json row for a given (set, booster type), trying the requested
    vendor/priceMode combination first before falling back to broader rows."""
    s_code = (set_code or "").lower()
    b_key = BOOSTER_ALIASES.get((booster_code or "").lower(), (booster_code or "").lower())
    v_key = (vendor or "tcgplayer").lower()
    p_key = (price_mode or "direct").lower()

    return (
        booster_ev_lookup.get((s_code, b_key, p_key, v_key))
        or booster_ev_lookup.get((s_code, b_key, p_key, "tcgplayer"))
        or booster_ev_lookup.get((s_code, b_key, p_key, "all"))
        or booster_ev_lookup.get((s_code, "default", p_key, v_key))
        or booster_ev_lookup.get((s_code, "default", p_key, "tcgplayer"))
    )


def evaluate_product_composite(prod, product_map, booster_ev_lookup, precon_decks, single_prices, depth=0, visited=None, vendor="tcgplayer", price_mode="direct"):
    """Recursively resolve a sealed product's total pack/card count and EV (avg/min/mid90/max)
    from its MTGJSON `contents` (sealed sub-products, packs, cards, decks)."""
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
                res = evaluate_product_composite(sub_prod, product_map, booster_ev_lookup, precon_decks, single_prices, depth + 1, visited.copy(), vendor=vendor, price_mode=price_mode)
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
                ev_row = get_pack_ev(booster_ev_lookup, sset, "draft", vendor=vendor, price_mode=price_mode)
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
            ev_row = get_pack_ev(booster_ev_lookup, pset, pcode, vendor=vendor, price_mode=price_mode)
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
                prices_dict = card_info.get("prices") or {}
                if vendor in prices_dict:
                    card_val = float(prices_dict[vendor] or 0.0)
                elif vendor == "all_average" and prices_dict:
                    v_prices = [float(v) for k, v in prices_dict.items() if k in ("tcgplayer", "cardmarket", "cardkingdom", "manapool") and float(v) > 0]
                    card_val = sum(v_prices) / len(v_prices) if v_prices else float(card_info.get("price", 0.0) or 0.0)
                else:
                    card_val = float(card_info.get("foilPrice" if is_foil else "price", 0.0) or 0.0)
            elif cd.get("price"):
                card_val = float(cd.get("price") or 0.0)

            ev_avg += ccnt * card_val
            ev_mid90 += ccnt * card_val
            ev_min += ccnt * (card_val * 0.8)
            ev_max += ccnt * (card_val * 1.2)

    # 4. Decks directly in contents (deterministic contents, so no min/max spread applied)
    if c.get("deck") and isinstance(c["deck"], list) and len(c["deck"]) > 0:
        for dk in c["deck"]:
            dname = (dk.get("name") or "").lower().strip()
            dset = (dk.get("set") or prod.get("setCode") or "").lower().strip()
            matched = None

            prod_uuid = prod.get("id") or prod.get("uuid")
            if prod_uuid and prod_uuid in precon_decks:
                matched = precon_decks[prod_uuid]
            elif dname in precon_decks:
                matched = precon_decks[dname]
            elif f"{dname}___{dset}" in precon_decks:
                matched = precon_decks[f"{dname}___{dset}"]
            else:
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

            ev_row = get_pack_ev(booster_ev_lookup, s_code, b_key, vendor=vendor, price_mode=price_mode)
            if ev_row:
                p_ev = float(ev_row.get("evAverage", 0) or 0)
                ev_avg = packs * p_ev
                ev_mid90 = packs * float(ev_row.get("evMid90", p_ev) or p_ev)
                ev_min = packs * float(ev_row.get("evMin", 0) or 0)
                ev_max = packs * float(ev_row.get("evMax", p_ev * 2) or p_ev * 2)
                booster_names.add(ev_row.get("boosterName", b_key))

    # Do not invent EV for products with explicit MTGJSON contents that simply priced at 0
    # (e.g. accessory-only bundles) - fall back to the product's own market price as its EV.
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
