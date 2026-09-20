"""
ingest_mtgjson_precons.py
Authoritative MTGJSON Preconstructed Deck Ingestion & Vendor Pricing Engine.

Rules:
1. NO PRICING FROM SCRYFALL: Card pricing is strictly sourced from MTGJSON vendor
   feeds (TCGplayer Market/Direct, Card Kingdom, Cardmarket EUR/USD) via AllPricesToday.
2. SCRYFALL IS STRICTLY FOR ARTWORK & BROWSING LINKS: Scryfall is used exclusively for
   cards.scryfall.io image URLs and external Scryfall set/card browsing URLs.
"""
import glob
import json
import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DATA_DIR = ROOT_DIR / "public" / "data"
DIST_DATA_DIR = ROOT_DIR / "dist" / "data"
DECKS_DIR = Path("/tmp/decks")
ALL_PRICES_FILE = Path("/tmp/AllPricesToday.json")

def get_primary_type(type_line: str, types: list) -> str:
    tl = (type_line or "").lower()
    if "creature" in tl:
        return "Creature"
    if "planeswalker" in tl:
        return "Planeswalker"
    if "instant" in tl:
        return "Instant"
    if "sorcery" in tl:
        return "Sorcery"
    if "artifact" in tl:
        return "Artifact"
    if "enchantment" in tl:
        return "Enchantment"
    if "battle" in tl:
        return "Battle"
    if "land" in tl:
        return "Land"
    if types and len(types) > 0:
        return types[0].capitalize()
    return "Other"

def main():
    print("=" * 70)
    print("Authoritative MTGJSON Preconstructed Deck Ingestion & Vendor Pricing Engine")
    print("=" * 70)

    if not ALL_PRICES_FILE.exists():
        print(f"[ERROR] {ALL_PRICES_FILE} not found!")
        return

    print("▶ 1. Loading MTGJSON AllPricesToday vendor price feed...")
    with open(ALL_PRICES_FILE, "r", encoding="utf-8") as f:
        all_prices_data = json.load(f).get("data", {})
    print(f"  ✔ Loaded pricing index for {len(all_prices_data):,} card UUIDs.")

    # Helper to resolve MTGJSON vendor prices
    def resolve_card_prices(card_uuid: str, want_foil: bool = False):
        entry = all_prices_data.get(card_uuid, {}).get("paper", {})
        res = {}
        for vendor in ["tcgplayer", "cardkingdom", "cardmarket"]:
            v_data = entry.get(vendor, {}).get("retail", {})
            price_dict = v_data.get("foil") if want_foil else v_data.get("normal")
            if price_dict:
                latest_date = sorted(price_dict.keys())[-1]
                val = float(price_dict[latest_date])
                if vendor == "cardmarket":
                    res["cardmarketEur"] = round(val, 2)
                    res["cardmarket"] = round(val * 1.09, 2)
                else:
                    res[vendor] = round(val, 2)

        valid_vals = [v for k, v in res.items() if k in ["tcgplayer", "cardkingdom", "cardmarket"] and v and v > 0]
        if valid_vals:
            res["all_cheapest"] = round(min(valid_vals), 2)
            res["all_average"] = round(sum(valid_vals) / len(valid_vals), 2)
        return res

    # 2. Load existing single_card_prices.json
    single_prices_path = PUBLIC_DATA_DIR / "single_card_prices.json"
    single_prices = {"byUuid": {}, "byName": {}}
    if single_prices_path.exists():
        with open(single_prices_path, "r", encoding="utf-8") as f:
            single_prices = json.load(f)
            if "byUuid" not in single_prices:
                single_prices["byUuid"] = {}
            if "byName" not in single_prices:
                single_prices["byName"] = {}

    # 3. Load existing precon_decks.json
    precon_decks_path = PUBLIC_DATA_DIR / "precon_decks.json"
    precon_decks = {}
    if precon_decks_path.exists():
        with open(precon_decks_path, "r", encoding="utf-8") as f:
            precon_decks = json.load(f)

    # 4. Load sealed_products.json
    sealed_prods_path = PUBLIC_DATA_DIR / "sealed_products.json"
    sealed_prods = []
    if sealed_prods_path.exists():
        with open(sealed_prods_path, "r", encoding="utf-8") as f:
            sealed_prods = json.load(f)

    deck_files = sorted(glob.glob(str(DECKS_DIR / "*.json")))
    print(f"\n▶ 2. Processing {len(deck_files)} downloaded MTGJSON deck files...")

    ingested_count = 0

    for df in deck_files:
        try:
            with open(df, "r", encoding="utf-8") as f:
                deck_data = json.load(f).get("data", {})
        except Exception as e:
            continue

        raw_name = deck_data.get("name")
        set_code = (deck_data.get("code") or "").upper()
        if not raw_name or not set_code:
            continue

        sealed_uuids = deck_data.get("sealedProductUuids") or []
        is_collector_deck = "collector" in raw_name.lower() or "collector" in df.lower()

        commanders = deck_data.get("commander", [])
        main_board = deck_data.get("mainBoard", [])
        all_deck_cards = commanders + main_board

        if not all_deck_cards:
            continue

        # Map cards and calculate prices
        processed_cards = []
        cards_by_type = {}
        types_summary = {}

        total_ev = 0.0
        pricing_incomplete = False

        for c in all_deck_cards:
            c_name = c.get("name", "Unknown")
            c_uuid = c.get("uuid", "")
            scryfall_id = c.get("identifiers", {}).get("scryfallId", "")
            count = int(c.get("count", 1) or 1)
            is_foil = is_collector_deck or c.get("isFoil", False) or ('foil' in c.get('finishes', []) and 'nonfoil' not in c.get('finishes', []))

            # Fetch MTGJSON vendor prices strictly (No Scryfall pricing)
            vendor_prices = resolve_card_prices(c_uuid, want_foil=is_foil)
            unit_price = vendor_prices.get("all_cheapest")
            if unit_price is None:
                pricing_incomplete = True
                unit_price = 0.0
            unit_price = round(unit_price, 2)
            total_ev += unit_price * count

            # Scryfall used strictly for artwork CDN image URL
            img_url = (
                f"https://cards.scryfall.io/normal/front/{scryfall_id[0]}/{scryfall_id[1]}/{scryfall_id}.jpg"
                if scryfall_id
                else ""
            )

            primary_type = get_primary_type(c.get("type", ""), c.get("types", []))
            types_summary[primary_type] = types_summary.get(primary_type, 0) + count

            card_obj = {
                "name": c_name,
                "uuid": c_uuid,
                "scryfallId": scryfall_id,
                "count": count,
                "manaCost": c.get("manaCost", ""),
                "cmc": float(c.get("manaValue") or c.get("convertedManaCost") or 0.0),
                "typeLine": c.get("type", ""),
                "primaryType": primary_type,
                "rarity": c.get("rarity", "common").lower(),
                "price": unit_price,
                "prices": vendor_prices,
                "foil": is_foil,
                "imageUrl": img_url,
                "setCode": set_code,
            }
            processed_cards.append(card_obj)

            if primary_type not in cards_by_type:
                cards_by_type[primary_type] = []
            cards_by_type[primary_type].append(card_obj)

            # Update single_card_prices.json index
            if c_uuid:
                single_prices["byUuid"][c_uuid] = {
                    "name": c_name,
                    "set": set_code.lower(),
                    "price": unit_price,
                    "ev": unit_price,
                    "prices": vendor_prices,
                    "imageUrl": img_url,
                    "rarity": c.get("rarity", "common").lower(),
                    "scryfallId": scryfall_id,
                    "foil": is_foil,
                }
            single_prices["byName"][c_name.lower()] = {
                "name": c_name,
                "set": set_code.lower(),
                "price": unit_price,
                "ev": unit_price,
                "prices": vendor_prices,
                "imageUrl": img_url,
                "rarity": c.get("rarity", "common").lower(),
                "scryfallId": scryfall_id,
                "foil": is_foil,
            }

        total_ev = round(total_ev, 2)

        # Sort top chase cards
        sorted_chases = sorted(processed_cards, key=lambda x: x["price"], reverse=True)[:10]

        cmdr_names = [cm.get("name") for cm in commanders]
        theme_desc = f"{set_code} Commander deck led by {', '.join(cmdr_names)}" if cmdr_names else f"{set_code} preconstructed deck"

        is_cmd = bool(commanders or "commander" in raw_name.lower() or "commander" in (deck_data.get("type") or "").lower())
        deck_entry = {
            "deckName": raw_name,
            "name": raw_name,
            "setCode": set_code,
            "set": set_code.lower(),
            "theme": theme_desc,
            "format": "commander" if is_cmd else (deck_data.get("type") or "casual").lower(),
            "cardCount": sum(c["count"] for c in processed_cards),
            "totalCards": sum(c["count"] for c in processed_cards),
            "singlesEv": total_ev if not pricing_incomplete else None,
            "totalSinglesEv": total_ev if not pricing_incomplete else None,
            "estimatedEv": total_ev if not pricing_incomplete else None,
            "topChases": sorted_chases,
            "keyCards": sorted_chases,
            "cards": processed_cards,
            "typesSummary": types_summary,
            "cardsByType": cards_by_type,
            "sealedProductUuids": sealed_uuids,
            "isCommander": is_cmd,
            "pricingComplete": not pricing_incomplete,
        }

        # Index under multiple lookup keys for robust matching
        clean_name = raw_name.strip()
        lower_name = clean_name.lower()
        precon_decks[clean_name] = deck_entry
        precon_decks[lower_name] = deck_entry
        precon_decks[f"{lower_name}___{set_code.lower()}"] = deck_entry

        for s_uuid in sealed_uuids:
            precon_decks[s_uuid] = deck_entry

        ingested_count += 1

    print(f"  ✔ Ingested {ingested_count} decks. Total keys in precon_decks.json: {len(precon_decks):,}")

    # 5. Enrich sealed_products.json with true singles deck EV
    print("\n▶ 3. Synchronizing sealed_products.json with singles EV...")
    updated_sealed_count = 0
    for p in sealed_prods:
        p_id = p.get("id")
        p_name = p.get("displayName", "")
        p_set = (p.get("setCode") or "").lower()
        contents = p.get("contents") or {}

        matched_deck = None
        if p_id and p_id in precon_decks:
            matched_deck = precon_decks[p_id]
        elif isinstance(contents, dict) and contents.get("deck"):
            for dk in contents["deck"]:
                dk_name = dk.get("name", "")
                if dk_name in precon_decks:
                    matched_deck = precon_decks[dk_name]
                    break
                elif dk_name.lower() in precon_decks:
                    matched_deck = precon_decks[dk_name.lower()]
                    break
                elif f"{dk_name.lower()}___{p_set}" in precon_decks:
                    matched_deck = precon_decks[f"{dk_name.lower()}___{p_set}"]
                    break

        if not matched_deck:
            # Try fuzzy matching displayName
            p_name_lower = p_name.lower()
            for key, d_val in precon_decks.items():
                if isinstance(d_val, dict) and d_val.get("setCode", "").lower() == p_set:
                    d_name_lower = d_val.get("deckName", "").lower()
                    if d_name_lower in p_name_lower:
                        matched_deck = d_val
                        break

        if matched_deck and isinstance(matched_deck, dict):
            deck_ev = float(matched_deck.get("singlesEv") or matched_deck.get("estimatedEv") or 0.0)
            if matched_deck.get("pricingComplete", True) and deck_ev > 0:
                p["estimatedEv"] = deck_ev
                updated_sealed_count += 1
            elif not matched_deck.get("pricingComplete", True):
                p.pop("estimatedEv", None)

    print(f"  ✔ Populated estimatedEv for {updated_sealed_count} preconstructed products in sealed_products.json.")

    # 6. Save updated data files
    print("\n▶ 4. Writing updated data files...")
    with open(precon_decks_path, "w", encoding="utf-8") as f:
        json.dump(precon_decks, f, indent=2)
    with open(single_prices_path, "w", encoding="utf-8") as f:
        json.dump(single_prices, f, indent=2)
    with open(sealed_prods_path, "w", encoding="utf-8") as f:
        json.dump(sealed_prods, f, indent=2)

    # Sync to dist/ if dist exists
    if DIST_DATA_DIR.exists():
        with open(DIST_DATA_DIR / "precon_decks.json", "w", encoding="utf-8") as f:
            json.dump(precon_decks, f, indent=2)
        with open(DIST_DATA_DIR / "single_card_prices.json", "w", encoding="utf-8") as f:
            json.dump(single_prices, f, indent=2)
        with open(DIST_DATA_DIR / "sealed_products.json", "w", encoding="utf-8") as f:
            json.dump(sealed_prods, f, indent=2)

    print("\n[SUCCESS] MTGJSON Preconstructed Deck Ingestion & Vendor Pricing sync complete!")

if __name__ == "__main__":
    main()
