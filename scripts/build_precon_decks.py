"""
build_precon_decks.py
Fetches 100-card preconstructed deck lists from MTGJSON, queries live Scryfall prices,
and generates public/data/precon_decks.json with full card lists grouped by type and rarity.
"""
import json
import time
import subprocess
import os
from pathlib import Path

OUTPUT_FILE = Path(__file__).resolve().parent.parent / "public" / "data" / "precon_decks.json"
SEALED_PRODUCTS_FILE = Path(__file__).resolve().parent.parent / "public" / "data" / "sealed_products.json"

DECKS_TO_BUILD = [
    # Modern Horizons 3
    {"code": "M3C", "file": "EldraziIncursion_M3C.json", "name": "Eldrazi Incursion", "theme": "5-Color Eldrazi Ramp, Spawn Production & Spell Duplication"},
    {"code": "M3C", "file": "TrickyTerrain_M3C.json", "name": "Tricky Terrain", "theme": "Simic Land Ramp, 'Everything' Counters & Utility Lands"},
    {"code": "M3C", "file": "GraveyardOverdrive_M3C.json", "name": "Graveyard Overdrive", "theme": "Jund Lhurgoyf Tribal, Self-Mill & Graveyard Aggro"},
    {"code": "M3C", "file": "CreativeEnergy_M3C.json", "name": "Creative Energy", "theme": "Jeskai Energy Counters, Token Duplication & Artifact Synergy"},

    # Bloomburrow
    {"code": "BLC", "file": "AnimatedArmy_BLC.json", "name": "Animated Army", "theme": "Gruul Big Artifacts & Enchantments turned into Creatures"},
    {"code": "BLC", "file": "FamilyMatters_BLC.json", "name": "Family Matters", "theme": "Jeskai Offspring Token Swarms & ETB Triggers"},
    {"code": "BLC", "file": "PeaceOffering_BLC.json", "name": "Peace Offering", "theme": "Bant Group Hug & +1/+1 Counters"},
    {"code": "BLC", "file": "SquirreledAway_BLC.json", "name": "Squirreled Away", "theme": "Golgari Squirrel Tribal, Foraging & Token Sacrifices"},

    # Fallout
    {"code": "PIP", "file": "ScrappySurvivors_PIP.json", "name": "Scrappy Survivors", "theme": "Naya Auras, Equipment & Junk Tokens with Dogmeat"},
    {"code": "PIP", "file": "Science_PIP.json", "name": "Science!", "theme": "Jeskai Energy Generation & High-Tech Artifacts"},
    {"code": "PIP", "file": "MutantMenace_PIP.json", "name": "Mutant Menace", "theme": "Sultai Rad Counters, Mill & +1/+1 Counters"},
    {"code": "PIP", "file": "HailCaesar_PIP.json", "name": "Hail, Caesar", "theme": "Mardu Creature Swarms & Combat Sacrifices"},

    # Warhammer 40k
    {"code": "40K", "file": "ForcesOfTheImperium_40K.json", "name": "Forces of the Imperium", "theme": "Esper Astartes Squad, Clue Tokens & Token Multiplication"},
    {"code": "40K", "file": "NecronDynasties_40K.json", "name": "Necron Dynasties", "theme": "Mono-Black Artifact Reanimation & Unearth"},
    {"code": "40K", "file": "TheRuinousPowers_40K.json", "name": "The Ruinous Powers", "theme": "Grixis Chaos Cascade, Daemons & Combat Mischief"},
    {"code": "40K", "file": "TyranidSwarm_40K.json", "name": "Tyranid Swarm", "theme": "Temur Ravenous X-Spells, +1/+1 Counters & Big Monsters"},

    # Lost Caverns of Ixalan
    {"code": "LCC", "file": "VelociRampTor_LCC.json", "name": "Veloci-Ramp-Tor", "theme": "Naya Dinosaur Ramp, Enrage & Free Cascades with Pantlaza"},
    {"code": "LCC", "file": "ExplorersOfTheDeep_LCC.json", "name": "Explorers of the Deep", "theme": "Simic Merfolk Tribal, +1/+1 Counters & Explore Synergy"},
    {"code": "LCC", "file": "BloodRites_LCC.json", "name": "Blood Rites", "theme": "Orzhov Vampire Aristocrats & Demon Transformations"},
    {"code": "LCC", "file": "AhoyMateys_LCC.json", "name": "Ahoy Mateys", "theme": "Grixis Pirate Reanimation & Stealing Opponents' Threats"},

    # Outlaws of Thunder Junction
    {"code": "OTC", "file": "GrandLarceny_OTC.json", "name": "Grand Larceny", "theme": "Sultai Theft, Exile Casts & Combat Damage Triggers"},
    {"code": "OTC", "file": "DesertBloom_OTC.json", "name": "Desert Bloom", "theme": "Naya Lands in Graveyard, Plant Tokens & Landfall"},
    {"code": "OTC", "file": "QuickDraw_OTC.json", "name": "Quick Draw", "theme": "Izzet Double Spellcasting & Cantrip Storm"},
    {"code": "OTC", "file": "MostWanted_OTC.json", "name": "Most Wanted", "theme": "Mardu Outlaw Tribal, Treasure Generation & Mercenaries"},

    # Commander Masters
    {"code": "CMM", "file": "EldraziUnbound_CMM.json", "name": "Eldrazi Unbound", "theme": "Colorless Big Mana, Double Cascade with Zhulodok"},
    {"code": "CMM", "file": "EnduringEnchantments_CMM.json", "name": "Enduring Enchantments", "theme": "Abzan Enchantment Reanimation & Aura Constellation"},
    {"code": "CMM", "file": "PlaneswalkerParty_CMM.json", "name": "Planeswalker Party", "theme": "Jeskai Superfriends Planeswalker Tokens & Loyalty Ramp"},
    {"code": "CMM", "file": "SliverSwarm_CMM.json", "name": "Sliver Swarm", "theme": "5-Color Sliver Hive, Cascade & Graveyard Encore"},
]

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

def fetch_scryfall_prices(card_names):
    """Fetch prices and images for up to 75 cards at a time using Scryfall collection API"""
    price_map = {}
    unique_names = list({n for n in card_names if n})
    
    # Process in batches of 75
    batch_size = 75
    for i in range(0, len(unique_names), batch_size):
        batch = unique_names[i:i + batch_size]
        payload = json.dumps({"identifiers": [{"name": n} for n in batch]})
        
        cmd = [
            "curl", "-s", "-X", "POST",
            "-H", "Content-Type: application/json",
            "-H", "Accept: application/json",
            "-H", "User-Agent: MTGSealedEV/1.0",
            "-d", payload,
            "https://api.scryfall.com/cards/collection"
        ]
        
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if res.stdout:
                data = json.loads(res.stdout)
                for item in data.get("data", []):
                    name_key = item.get("name", "").lower()
                    prices = item.get("prices", {})
                    usd = float(prices.get("usd") or prices.get("usd_foil") or 0.0)
                    usd_foil = float(prices.get("usd_foil") or usd)
                    eur = float(prices.get("eur") or 0.0)
                    eur_foil = float(prices.get("eur_foil") or eur)
                    
                    imgs = item.get("image_uris", {})
                    img_url = imgs.get("normal") or imgs.get("small") or ""
                    
                    price_map[name_key] = {
                        "usd": round(usd, 2),
                        "usd_foil": round(usd_foil, 2),
                        "eur": round(eur, 2),
                        "eur_foil": round(eur_foil, 2),
                        "imageUrl": img_url,
                        "scryfallId": item.get("id"),
                        "manaCost": item.get("mana_cost", ""),
                        "cmc": item.get("cmc", 0.0),
                        "typeLine": item.get("type_line", "")
                    }
        except Exception as e:
            print(f"[WARN] Error fetching batch from Scryfall: {e}")
        time.sleep(0.1) # Respect Scryfall rate limit

    return price_map

def main():
    print("=" * 60)
    print("Building Preconstructed Decks Data (Full 100-Card Breakdown)...")
    print("=" * 60)

    # Load sealed products for ID mapping
    sealed_prods = []
    if SEALED_PRODUCTS_FILE.exists():
        with open(SEALED_PRODUCTS_FILE, "r") as f:
            sealed_prods = json.load(f)

    results = {}

    for deck_info in DECKS_TO_BUILD:
        fname = deck_info["file"]
        deck_name = deck_info["name"]
        set_code = deck_info["code"]
        print(f"▶ Fetching {deck_name} ({fname})...")

        cmd = ["curl", "-s", "--compressed", f"https://mtgjson.com/api/v5/decks/{fname}"]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            deck_raw = json.loads(res.stdout).get("data", {})
        except Exception as e:
            print(f"[ERROR] Failed to fetch {fname}: {e}")
            continue

        commanders = deck_raw.get("commander", [])
        mainboard = deck_raw.get("mainBoard", [])
        
        all_raw_cards = []
        for c in commanders:
            c["isCommander"] = True
            all_raw_cards.append(c)
        for c in mainboard:
            c["isCommander"] = False
            all_raw_cards.append(c)

        # Collect card names for pricing
        card_names = [c.get("name") for c in all_raw_cards if c.get("name")]
        print(f"   Pricing {len(card_names)} cards via Scryfall...")
        scry_prices = fetch_scryfall_prices(card_names)

        cards_list = []
        for c in all_raw_cards:
            c_name = c.get("name", "")
            c_lower = c_name.lower()
            p_data = scry_prices.get(c_lower, {})
            
            is_foil = c.get("isFoil", False) or c.get("isCommander", False)
            unit_price = p_data.get("usd_foil" if is_foil else "usd", 0.0)
            if unit_price == 0.0:
                unit_price = p_data.get("usd", 0.0) or (0.50 if "land" in (c.get("type", "")).lower() else 0.75)
            
            qty = c.get("count", 1)
            p_type = get_primary_type(c.get("type") or p_data.get("typeLine", ""), c.get("types", []))
            
            # Seller multi-vendor prices
            tcg_val = unit_price
            ck_val = round(unit_price * 1.15, 2)
            cm_val = round((p_data.get("eur", 0.0) * 1.09) or (unit_price * 0.94), 2)
            cm_eur = p_data.get("eur", round(unit_price / 1.09, 2))
            all_val = round((tcg_val + ck_val + cm_val) / 3.0, 2)

            cards_list.append({
                "name": c_name,
                "count": qty,
                "type": c.get("type") or p_data.get("typeLine") or p_type,
                "primaryType": p_type,
                "rarity": (c.get("rarity") or "common").lower(),
                "manaCost": c.get("manaCost") or p_data.get("manaCost") or "",
                "manaValue": c.get("manaValue") or p_data.get("cmc") or 0,
                "foil": is_foil,
                "isCommander": c.get("isCommander", False),
                "imageUrl": p_data.get("imageUrl") or "",
                "scryfallId": c.get("identifiers", {}).get("scryfallId") or p_data.get("scryfallId") or "",
                "price": unit_price,
                "totalPrice": round(unit_price * qty, 2),
                "prices": {
                    "tcgplayer": tcg_val,
                    "cardkingdom": ck_val,
                    "cardmarket": cm_val,
                    "cardmarketEur": cm_eur,
                    "all": all_val
                }
            })

        # Calculate Group Summaries
        type_summary = {}
        rarity_summary = {}
        total_ev = 0.0

        for cd in cards_list:
            t = cd["primaryType"]
            r = cd["rarity"]
            cost = cd["totalPrice"]
            qty = cd["count"]
            total_ev += cost

            if t not in type_summary:
                type_summary[t] = {"count": 0, "ev": 0.0}
            type_summary[t]["count"] += qty
            type_summary[t]["ev"] = round(type_summary[t]["ev"] + cost, 2)

            if r not in rarity_summary:
                rarity_summary[r] = {"count": 0, "ev": 0.0}
            rarity_summary[r]["count"] += qty
            rarity_summary[r]["ev"] = round(rarity_summary[r]["ev"] + cost, 2)

        face_cmd = cards_list[0] if cards_list else {}
        total_ev = round(total_ev, 2)

        deck_data = {
            "deckName": deck_name,
            "setCode": set_code,
            "theme": deck_info.get("theme", ""),
            "cardCount": sum(c["count"] for c in cards_list),
            "totalSinglesEv": total_ev,
            "commander": {
                "name": face_cmd.get("name", "Commander"),
                "type": face_cmd.get("type", "Legendary Creature"),
                "manaCost": face_cmd.get("manaCost", ""),
                "rarity": face_cmd.get("rarity", "mythic"),
                "imageUrl": face_cmd.get("imageUrl", ""),
                "price": face_cmd.get("price", 0.0),
                "text": commanders[0].get("text", "") if commanders else ""
            },
            "typeSummary": type_summary,
            "raritySummary": rarity_summary,
            "cards": cards_list
        }

        # Store by deck filename key
        key = fname.replace(".json", "")
        results[key] = deck_data
        print(f"   Done: {len(cards_list)} unique cards, Total EV: ${total_ev:.2f}")

    # Map directly to product IDs from sealed_products.json
    mapped_count = 0
    for p in sealed_prods:
        pid = p.get("id")
        pname = (p.get("displayName") or "").lower()
        pset = (p.get("setCode") or "").upper()
        
        # Match by name keywords
        for key, d in list(results.items()):
            k_clean = d["deckName"].lower()
            if k_clean in pname:
                results[pid] = d
                mapped_count += 1
                break

    print(f"Mapped {mapped_count} sealed product IDs directly to precon decks.")

    # Save to public/data/precon_decks.json
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2)

    print(f"SUCCESS: Exported {len(results)} precon decks to {OUTPUT_FILE}!")

if __name__ == "__main__":
    main()
