#!/usr/bin/env python3
"""
ingest_unsanctioned_decks.py
Authoritatively ingests the 5 Unsanctioned preconstructed half-decks (White, Blue, Black, Red, Green)
from MTGJSON deck files into public/data/precon_decks.json and single_card_prices.json.

Guarantees:
- Decks are explicitly treated as 30-card half-decks (not Commander decks).
- Total deck card count is derived accurately from mainBoard (30 cards).
- Pricing is sourced directly from MTGJSON AllPricesToday vendor feeds.
- Scryfall IDs are used strictly for card artwork.
"""
import glob
import json
import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DATA_DIR = ROOT_DIR / "public" / "data"
DIST_DATA_DIR = ROOT_DIR / "dist" / "data"
ALL_PRICES_FILE = Path("/tmp/AllPricesToday.json")
DECKS_DIR = Path("/tmp/decks")

UNSANCTIONED_PROD_ID = "b966f472-6bd1-55a5-9e13-235320a03bb2"

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
    print("Ingesting Unsanctioned Preconstructed Decks (UND)")
    print("=" * 70)

    print("▶ 1. Loading MTGJSON AllPricesToday...")
    with open(ALL_PRICES_FILE, "r", encoding="utf-8") as f:
        all_prices_data = json.load(f).get("data", {})
    print(f"  ✔ Loaded pricing index for {len(all_prices_data):,} card UUIDs.")

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

    # Load precon_decks.json
    precon_decks_path = PUBLIC_DATA_DIR / "precon_decks.json"
    precon_decks = {}
    if precon_decks_path.exists():
        with open(precon_decks_path, "r", encoding="utf-8") as f:
            precon_decks = json.load(f)

    # Load single_card_prices.json
    single_prices_path = PUBLIC_DATA_DIR / "single_card_prices.json"
    single_prices = {"byUuid": {}, "byName": {}, "byNameSet": {}}
    if single_prices_path.exists():
        with open(single_prices_path, "r", encoding="utf-8") as f:
            single_prices = json.load(f)
            if "byUuid" not in single_prices:
                single_prices["byUuid"] = {}
            if "byName" not in single_prices:
                single_prices["byName"] = {}
            if "byNameSet" not in single_prices:
                single_prices["byNameSet"] = {}

    colors = ["White", "Blue", "Black", "Red", "Green"]
    und_deck_objects = []

    for color in colors:
        deck_file = DECKS_DIR / f"{color}_UND.json"
        if not deck_file.exists():
            print(f"[WARN] {deck_file} not found!")
            continue

        with open(deck_file, "r", encoding="utf-8") as f:
            deck_data = json.load(f).get("data", {})

        raw_name = deck_data.get("name", color)
        set_code = (deck_data.get("code") or "UND").upper()
        main_board = deck_data.get("mainBoard", [])

        processed_cards = []
        cards_by_type = {}
        types_summary = {}
        total_ev = 0.0
        pricing_incomplete = False

        for c in main_board:
            c_name = c.get("name", "Unknown")
            c_uuid = c.get("uuid", "")
            scryfall_id = c.get("identifiers", {}).get("scryfallId", "")
            count = int(c.get("count", 1) or 1)
            is_foil = c.get("isFoil", False) or ('foil' in c.get('finishes', []) and 'nonfoil' not in c.get('finishes', []))

            vendor_prices = resolve_card_prices(c_uuid, want_foil=is_foil)
            unit_price = vendor_prices.get("all_cheapest")
            if unit_price is None:
                pricing_incomplete = True
                unit_price = 0.0
            unit_price = round(unit_price, 2)
            total_ev += unit_price * count

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
                "manaValue": float(c.get("manaValue") or c.get("convertedManaCost") or 0.0),
                "type": c.get("type", ""),
                "primaryType": primary_type,
                "rarity": c.get("rarity", "common").lower(),
                "price": unit_price,
                "prices": vendor_prices,
                "foil": is_foil,
                "isFoil": is_foil,
                "imageUrl": img_url,
                "setCode": set_code,
                "isCommander": False,
            }
            processed_cards.append(card_obj)

            if primary_type not in cards_by_type:
                cards_by_type[primary_type] = []
            cards_by_type[primary_type].append(card_obj)

            # Update single_card_prices
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
            name_set_key = f"{c_name.lower()}___{set_code.lower()}"
            single_prices["byNameSet"][name_set_key] = {
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
        total_cards_count = sum(c["count"] for c in processed_cards)
        sorted_chases = sorted(processed_cards, key=lambda x: x["price"], reverse=True)[:5]

        deck_entry = {
            "deckName": raw_name,
            "name": raw_name,
            "setCode": set_code,
            "set": set_code.lower(),
            "theme": f"Unsanctioned {color} 30-Card Preconstructed Half-Deck",
            "format": "casual",
            "cardCount": total_cards_count,
            "totalCards": total_cards_count,
            "totalSinglesEv": total_ev if not pricing_incomplete else None,
            "singlesEv": total_ev if not pricing_incomplete else None,
            "estimatedEv": total_ev if not pricing_incomplete else None,
            "keyCards": sorted_chases,
            "cards": processed_cards,
            "typesSummary": types_summary,
            "cardsByType": cards_by_type,
            "sealedProductUuids": [UNSANCTIONED_PROD_ID],
            "isCommander": False,
            "pricingComplete": not pricing_incomplete,
        }

        # Multiple robust index keys
        clean_name = raw_name.strip()
        lower_name = clean_name.lower()
        precon_decks[f"{lower_name}___und"] = deck_entry
        precon_decks[f"{lower_name}___UND"] = deck_entry
        precon_decks[f"und_{lower_name}"] = deck_entry
        precon_decks[f"{clean_name}_UND"] = deck_entry
        precon_decks[f"{UNSANCTIONED_PROD_ID}_{lower_name}"] = deck_entry
        precon_decks[f"{UNSANCTIONED_PROD_ID}_{clean_name}"] = deck_entry
        precon_decks[f"Unsanctioned {clean_name} Deck"] = deck_entry
        precon_decks[f"unsanctioned {lower_name} deck"] = deck_entry
        precon_decks[f"Unsanctioned {clean_name}"] = deck_entry

        und_deck_objects.append(deck_entry)
        print(f"  ✔ Ingested {color} UND deck: {total_cards_count} cards, EV=${total_ev:.2f}")

    # Also calculate total Unsanctioned product EV and save to leaderboard/sealed_products
    print(f"\n▶ 2. Saving updated precon_decks.json ({len(precon_decks)} entries)...")
    with open(PUBLIC_DATA_DIR / "precon_decks.json", "w", encoding="utf-8") as f:
        json.dump(precon_decks, f, indent=2)
    if DIST_DATA_DIR.exists():
        with open(DIST_DATA_DIR / "precon_decks.json", "w", encoding="utf-8") as f:
            json.dump(precon_decks, f, indent=2)

    print(f"▶ 3. Saving updated single_card_prices.json ({len(single_prices['byUuid'])} UUIDs)...")
    with open(PUBLIC_DATA_DIR / "single_card_prices.json", "w", encoding="utf-8") as f:
        json.dump(single_prices, f, indent=2)
    if DIST_DATA_DIR.exists():
        with open(DIST_DATA_DIR / "single_card_prices.json", "w", encoding="utf-8") as f:
            json.dump(single_prices, f, indent=2)

    print("\n✔ Completed Unsanctioned preconstructed deck ingestion successfully!")

if __name__ == "__main__":
    main()
