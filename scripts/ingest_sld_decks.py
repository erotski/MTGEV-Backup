"""
ingest_sld_decks.py
Ingests all 743 Secret Lair (SLD) preconstructed decks, single card pricing, and singles EV from MTGJSON.
"""
import json
import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DATA_DIR = ROOT_DIR / "public" / "data"
DIST_DATA_DIR = ROOT_DIR / "dist" / "data"

SLD_FILE = Path("/tmp/SLD.json")
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

def resolve_prices(all_prices_data, card_uuid, want_foil=False):
    entry = all_prices_data.get(card_uuid, {}).get("paper", {})
    res = {}
    for vendor in ["tcgplayer", "cardkingdom", "cardmarket"]:
        v_data = entry.get(vendor, {}).get("retail", {})
        price_dict = v_data.get("foil") if want_foil else v_data.get("normal")
        if not price_dict:
            price_dict = v_data.get("normal") or v_data.get("foil") or {}
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
        res["all"] = round(sum(valid_vals) / len(valid_vals), 2)
    else:
        res["all"] = 0.05
    return res

def main():
    print("=" * 70)
    print("Ingesting Secret Lair (SLD) Decks and Cards into System...")
    print("=" * 70)

    if not SLD_FILE.exists():
        print(f"[ERROR] {SLD_FILE} not found!")
        return

    if not ALL_PRICES_FILE.exists():
        print(f"[ERROR] {ALL_PRICES_FILE} not found!")
        return

    with open(SLD_FILE, "r", encoding="utf-8") as f:
        sld_data = json.load(f).get("data", {})

    with open(ALL_PRICES_FILE, "r", encoding="utf-8") as f:
        all_prices_data = json.load(f).get("data", {})

    cards_by_uuid = {c["uuid"]: c for c in sld_data.get("cards", [])}
    print(f"Loaded {len(cards_by_uuid):,} cards from SLD.json")

    # Load existing single_card_prices.json
    single_prices_path = PUBLIC_DATA_DIR / "single_card_prices.json"
    single_prices = {"byUuid": {}, "byName": {}, "byNameSet": {}}
    if single_prices_path.exists():
        with open(single_prices_path, "r", encoding="utf-8") as f:
            single_prices = json.load(f)
            if "byUuid" not in single_prices: single_prices["byUuid"] = {}
            if "byName" not in single_prices: single_prices["byName"] = {}
            if "byNameSet" not in single_prices: single_prices["byNameSet"] = {}

    # Load existing precon_decks.json
    precon_decks_path = PUBLIC_DATA_DIR / "precon_decks.json"
    precon_decks = {}
    if precon_decks_path.exists():
        with open(precon_decks_path, "r", encoding="utf-8") as f:
            precon_decks = json.load(f)

    # Ingest every card in SLD
    for uuid, c in cards_by_uuid.items():
        name = c.get("name", "")
        number = c.get("number", "")
        scryfall_id = c.get("identifiers", {}).get("scryfallId", "")
        normal_p = resolve_prices(all_prices_data, uuid, want_foil=False)
        foil_p = resolve_prices(all_prices_data, uuid, want_foil=True)

        card_entry = {
            "name": name,
            "set": "sld",
            "number": number,
            "scryfallId": scryfall_id,
            "tcgplayerPrice": normal_p.get("tcgplayer", 0),
            "cardKingdomPrice": normal_p.get("cardkingdom", 0),
            "cardmarketPrice": normal_p.get("cardmarket", 0),
            "price": normal_p.get("all", 0.05),
            "foilPrice": foil_p.get("all", 0.05),
            "foilTcgplayerPrice": foil_p.get("tcgplayer", 0),
            "foilCardKingdomPrice": foil_p.get("cardkingdom", 0),
            "foilCardmarketPrice": foil_p.get("cardmarket", 0),
            "type": c.get("type", "Card"),
            "rarity": c.get("rarity", "rare"),
        }
        single_prices["byUuid"][uuid] = card_entry
        single_prices["byName"][name.lower()] = card_entry
        single_prices["byNameSet"][f"{name.lower()}___sld"] = card_entry
        single_prices["byNameSet"][f"{name.lower()}_sld"] = card_entry

    print(f"Updated single_card_prices with {len(cards_by_uuid):,} SLD cards.")

    # Ingest SLD decks
    sld_decks = sld_data.get("decks", [])
    print(f"Processing {len(sld_decks):,} decks from SLD.json...")

    added_decks = 0
    for d in sld_decks:
        deck_name = d.get("name", "")
        if not deck_name:
            continue

        deck_type = d.get("type", "Secret Lair Drop")
        is_commander = (deck_type.lower() == "commander deck" or "commander" in deck_name.lower())
        is_foil = "foil" in deck_name.lower()

        commanders = []
        for cmd in d.get("commander", []):
            cuuid = cmd.get("uuid")
            cinfo = cards_by_uuid.get(cuuid, {})
            cfoil = bool(cmd.get("isFoil", is_foil))
            cp = resolve_prices(all_prices_data, cuuid, want_foil=cfoil)
            commanders.append({
                "name": cinfo.get("name", "Commander"),
                "uuid": cuuid,
                "count": cmd.get("count", 1),
                "isFoil": cfoil,
                "price": cp.get("all", 0.05),
                "scryfallId": cinfo.get("identifiers", {}).get("scryfallId", ""),
                "type": cinfo.get("type", "Legendary Creature"),
                "manaCost": cinfo.get("manaCost", ""),
                "rarity": cinfo.get("rarity", "mythic"),
                "number": cinfo.get("number", "")
            })

        display_commanders = []
        for dcmd in d.get("displayCommander", []):
            cuuid = dcmd.get("uuid")
            cinfo = cards_by_uuid.get(cuuid, {})
            display_commanders.append({
                "name": cinfo.get("name", "Display Commander"),
                "uuid": cuuid,
                "count": dcmd.get("count", 1),
                "isFoil": True,
                "isDisplayOnly": True,
                "scryfallId": cinfo.get("identifiers", {}).get("scryfallId", ""),
                "type": cinfo.get("type", "Display Commander")
            })

        cards = []
        for mc in d.get("mainBoard", []):
            cuuid = mc.get("uuid")
            cinfo = cards_by_uuid.get(cuuid, {})
            cfoil = bool(mc.get("isFoil", is_foil))
            cp = resolve_prices(all_prices_data, cuuid, want_foil=cfoil)
            count = mc.get("count", 1)
            unit_p = cp.get("all", 0.05)
            types_list = cinfo.get("types", [])
            primary_type = get_primary_type(cinfo.get("type", ""), types_list)

            cards.append({
                "uuid": cuuid,
                "name": cinfo.get("name", "Card"),
                "count": count,
                "set": "sld",
                "setCode": "SLD",
                "number": cinfo.get("number", ""),
                "scryfallId": cinfo.get("identifiers", {}).get("scryfallId", ""),
                "price": unit_p,
                "unitPrice": unit_p,
                "totalPrice": round(unit_p * count, 2),
                "tcgplayerPrice": cp.get("tcgplayer", 0),
                "cardKingdomPrice": cp.get("cardkingdom", 0),
                "cardmarketPrice": cp.get("cardmarket", 0),
                "foil": cfoil,
                "isFoil": cfoil,
                "type": cinfo.get("type", primary_type),
                "primaryType": primary_type,
                "rarity": cinfo.get("rarity", "rare"),
                "manaCost": cinfo.get("manaCost", ""),
                "colors": cinfo.get("colors", []),
                "colorIdentity": cinfo.get("colorIdentity", [])
            })

        # Calculate exact total card count and singles EV
        total_main_count = sum(c["count"] for c in cards)
        total_cmd_count = sum(c["count"] for c in commanders)
        total_cards = total_main_count + total_cmd_count

        total_singles_ev = round(
            sum(c["totalPrice"] for c in cards) +
            sum(cmd["price"] * cmd["count"] for cmd in commanders),
            2
        )

        vendor_totals = {
            "tcgplayer": round(sum((c["tcgplayerPrice"] or c["price"]) * c["count"] for c in cards) + sum((cmd.get("tcgplayerPrice") or cmd["price"]) * cmd["count"] for cmd in commanders), 2),
            "cardkingdom": round(sum((c["cardKingdomPrice"] or c["price"]) * c["count"] for c in cards) + sum((cmd.get("cardKingdomPrice") or cmd["price"]) * cmd["count"] for cmd in commanders), 2),
            "cardmarket": round(sum((c["cardmarketPrice"] or c["price"]) * c["count"] for c in cards) + sum((cmd.get("cardmarketPrice") or cmd["price"]) * cmd["count"] for cmd in commanders), 2),
            "all": total_singles_ev
        }

        # Face commander (if commander deck)
        face_cmd = commanders[0] if commanders else None

        deck_payload = {
            "deckName": deck_name,
            "setName": "Secret Lair Drop",
            "setCode": "SLD",
            "releaseDate": sld_data.get("releaseDate", "2021-06-21"),
            "format": "commander" if is_commander else "casual",
            "type": deck_type,
            "isCommander": is_commander,
            "isFoil": is_foil,
            "cardCount": total_cards,
            "totalCards": total_cards,
            "commander": face_cmd,
            "commanders": commanders,
            "displayCommander": display_commanders,
            "cards": cards,
            "totalSinglesEv": total_singles_ev,
            "singlesEv": total_singles_ev,
            "vendorTotals": vendor_totals,
            "priceMode": "direct",
            "currency": "USD"
        }

        # Key variations
        clean_key = deck_name.replace(" ", "").replace(":", "").replace("'", "").replace("-", "").replace("&", "And") + "_SLD"
        precon_decks[clean_key] = deck_payload
        precon_decks[deck_name] = deck_payload
        precon_decks[deck_name.lower()] = deck_payload
        precon_decks[f"{deck_name.lower()}___sld"] = deck_payload
        precon_decks[f"{deck_name.lower()}_sld"] = deck_payload

        # Normalized variations for drop names
        d_lower = deck_name.lower().replace(":", "").replace("-", " ").replace("'", "").replace("&", "and")
        clean_d = " ".join(d_lower.split())
        precon_decks[clean_d] = deck_payload
        precon_decks[f"secret lair drop {clean_d}"] = deck_payload
        precon_decks[f"secret lair {clean_d}"] = deck_payload

        foil_variant = clean_d.replace(" foil edition", " foil")
        if foil_variant != clean_d:
            precon_decks[foil_variant] = deck_payload
            precon_decks[f"secret lair drop {foil_variant}"] = deck_payload
            precon_decks[f"secret lair {foil_variant}"] = deck_payload

        nonfoil_variant = clean_d.replace(" non foil edition", " non foil").replace(" non foil", "")
        if nonfoil_variant != clean_d:
            precon_decks[nonfoil_variant] = deck_payload
            precon_decks[f"secret lair drop {nonfoil_variant}"] = deck_payload
            precon_decks[f"secret lair {nonfoil_variant}"] = deck_payload

        added_decks += 1

    print(f"✔ Successfully added/updated {added_decks} SLD decks in precon_decks.json!")

    # Write output files
    with open(single_prices_path, "w", encoding="utf-8") as f:
        json.dump(single_prices, f, indent=2)

    with open(precon_decks_path, "w", encoding="utf-8") as f:
        json.dump(precon_decks, f, indent=2)

    if DIST_DATA_DIR.exists():
        with open(DIST_DATA_DIR / "single_card_prices.json", "w", encoding="utf-8") as f:
            json.dump(single_prices, f, indent=2)
        with open(DIST_DATA_DIR / "precon_decks.json", "w", encoding="utf-8") as f:
            json.dump(precon_decks, f, indent=2)

    print("✔ Written to public/data and dist/data successfully!")

if __name__ == "__main__":
    main()
