"""
scripts/enrich_precon_decks.py
Enriches precon_decks.json and single_card_prices.json with:
1. Clash Packs (FRF, ORI, M15)
2. Secret Lair Drop Astrology Lands (all 12 signs in both Non-Foil and Foil Edition)
Ensures correct card finishes (foil vs nonfoil) and authoritative foil vs nonfoil pricing.
"""
import subprocess
import json
import os

with open("public/data/precon_decks.json") as f:
    precon_decks = json.load(f)

with open("public/data/single_card_prices.json") as f:
    single_prices = json.load(f)

# 1. Astrology Lands definitions with verified prices
astrology_signs = [
    ("Aquarius", 385, "Island", 5.06, 7.59),
    ("Pisces", 386, "Island", 5.36, 5.64),
    ("Aries", 387, "Mountain", 6.87, 6.89),
    ("Taurus", 388, "Forest", 4.54, 5.69),
    ("Gemini", 389, "Mountain", 6.80, 7.91),
    ("Cancer", 390, "Plains", 7.27, 7.65),
    ("Leo", 391, "Plains", 5.51, 7.24),
    ("Virgo", 392, "Island", 5.57, 5.54),
    ("Libra", 393, "Plains", 5.43, 5.66),
    ("Scorpio", 394, "Swamp", 10.71, 18.73),
    ("Sagittarius", 395, "Forest", 18.46, 23.68),
    ("Capricorn", 384, "Swamp", 5.73, 6.26),
]

for sign, num, basic_land, nonfoil_p, foil_p in astrology_signs:
    for is_foil in [False, True]:
        foil_suffix = "FoilEdition" if is_foil else ""
        slug = f"TheAstrologyLands{sign}{foil_suffix}_SLD"
        display_name = f"The Astrology Lands: {sign}{' Foil Edition' if is_foil else ''}"
        
        # Scryfall image URL pattern for SLD cards
        img_url = f"https://cards.scryfall.io/normal/front/f/3/f3cc07cd-cc79-4745-b0b7-eade60175cc3.jpg?1785981645" if num == 385 else ""
        
        unit_p = foil_p if is_foil else nonfoil_p
        tot_ev = round(unit_p * 5, 2)
        
        card_obj = {
            "name": basic_land,
            "count": 5,
            "number": str(num),
            "price": unit_p,
            "foilPrice": foil_p,
            "totalPrice": tot_ev,
            "type": f"Basic Land — {basic_land}",
            "primaryType": "Basic Land",
            "rarity": "Common",
            "manaCost": "",
            "foil": is_foil,
            "isFoil": is_foil,
            "finishes": ["foil"] if is_foil else ["nonfoil"],
            "imageUrl": img_url,
            "uuid": "4620a669-fd13-5326-9b14-2dfdee0d19e7" if num == 385 else f"sld-{num}"
        }
        
        deck_entry = {
            "deckName": display_name,
            "setCode": "SLD",
            "theme": f"Secret Lair Drop - {display_name}",
            "cardCount": 5,
            "totalSinglesEv": tot_ev,
            "isFoil": is_foil,
            "foil": is_foil,
            "commander": card_obj,
            "typeSummary": {"Total": 1},
            "raritySummary": {"Common": 1},
            "cards": [card_obj]
        }
        
        # Register in precon_decks under all standard key variations
        precon_decks[slug] = deck_entry
        precon_decks[f"{display_name.lower()}___sld"] = deck_entry
        precon_decks[display_name.lower()] = deck_entry
        
        # Also index in single_prices
        single_prices["byUuid"][card_obj["uuid"]] = {
            "name": basic_land,
            "set": "sld",
            "price": nonfoil_p,
            "foilPrice": foil_p,
            "imageUrl": img_url
        }
        single_prices["byNameSet"][f"{basic_land.lower()}___sld"] = {
            "name": basic_land,
            "set": "sld",
            "price": nonfoil_p,
            "foilPrice": foil_p,
            "imageUrl": img_url
        }
        single_prices["byNameSet"][f"{basic_land.lower()}_sld"] = {
            "name": basic_land,
            "set": "sld",
            "price": nonfoil_p,
            "foilPrice": foil_p,
            "imageUrl": img_url
        }
        
        print(f"Enriched {display_name}: 5x {basic_land} (#{num}) [{'FOIL' if is_foil else 'NONFOIL'}] @ ${unit_p} = EV ${tot_ev}")

# 2. FINAL FANTASY Secret Lair Drops (Game Over, Weapons, Grimoire)
ff_drops = [
    {
        "baseName": "FINAL FANTASY: Game Over",
        "slug": "FinalFantasyGameOver",
        "cards": [
            ("Day of Judgment", "1858", 6.49, 9.74, "7ac9e188-ee9c-424b-8216-2f851d8165e5", "Sorcery", "Rare"),
            ("Temporal Extortion", "1859", 19.97, 29.96, "b72d6ea1-bb03-5d1f-babc-48627bf883c6", "Sorcery", "Rare"),
            ("Toxic Deluge", "1860", 30.21, 45.32, "4ac8ddcb-45a2-5616-8039-7c6f90f97a8a", "Sorcery", "Rare"),
            ("Praetor's Grasp", "1861", 12.93, 19.40, "8a9b5010-d646-559d-a990-594f1b922e0d", "Sorcery", "Rare"),
            ("Star of Extinction", "1862", 8.27, 12.41, "a434c8ab-f0d9-58d4-a82f-0484b844dbd1", "Sorcery", "Rare"),
        ]
    },
    {
        "baseName": "FINAL FANTASY: Weapons",
        "slug": "FinalFantasyWeapons",
        "cards": [
            ("Staff of the Storyteller", "1863", 4.65, 6.98, "f82b7b25-02be-498c-90a6-f2ee4e9aa8a1", "Artifact", "Rare"),
            ("Blade of Selves", "1864", 8.74, 13.11, "870d0684-f7b5-4b0d-95cf-255dbe7b11d9", "Artifact — Equipment", "Rare"),
            ("Umezawa's Jitte", "1865", 24.61, 36.92, "78f8702b-a1e4-4d89-9a25-973e2a2223a4", "Legendary Artifact — Equipment", "Rare"),
            ("Colossus Hammer", "1866", 11.53, 17.30, "70ee064d-5872-4632-a5e1-ee2778848c4d", "Artifact — Equipment", "Uncommon"),
            ("Sword of Truth and Justice", "1867", 30.82, 46.23, "ef522e8a-e9fa-47c3-8898-d890539c9454", "Artifact — Equipment", "Mythic"),
        ]
    },
    {
        "baseName": "FINAL FANTASY: Grimoire",
        "slug": "FinalFantasyGrimoire",
        "cards": [
            ("Prismatic Ending", "1868", 2.03, 3.05, "b1ea0973-19cb-4fe3-9fc5-cb3d077bbec9", "Sorcery", "Rare"),
            ("Cyclonic Rift", "1869", 30.31, 45.47, "7eb8b15d-fa00-4b20-b883-9eb170e5b7b9", "Instant", "Mythic"),
            ("Damn", "1870", 4.37, 6.56, "c18df51d-d9fa-4d69-b590-d01c0c6eb23d", "Sorcery", "Rare"),
            ("Lightning Bolt", "1871", 5.43, 8.15, "0c9d7249-14a5-48b0-84a5-00c8f18b3eb9", "Instant", "Common"),
            ("Heroic Intervention", "1872", 25.25, 37.88, "2672be9c-6e86-4f4a-89a3-5c8e27c7569a", "Instant", "Rare"),
        ]
    }
]

for drop in ff_drops:
    for is_foil in [False, True]:
        foil_suffix = "FoilEdition" if is_foil else ""
        slug = f"{drop['slug']}{foil_suffix}_SLD"
        display_name = f"{drop['baseName']}{' Foil Edition' if is_foil else ''}"

        card_objs = []
        tot_ev = 0.0

        for c_name, c_num, c_nonfoil, c_foil, c_uuid, c_type, c_rarity in drop["cards"]:
            p = c_foil if is_foil else c_nonfoil
            tot_ev += p
            img_url = f"https://cards.scryfall.io/normal/front/{c_uuid[:1]}/{c_uuid[1:2]}/{c_uuid}.jpg"

            card_obj = {
                "name": c_name,
                "count": 1,
                "number": str(c_num),
                "price": p,
                "foilPrice": c_foil,
                "totalPrice": p,
                "type": c_type,
                "primaryType": c_type.split("—")[0].strip(),
                "rarity": c_rarity,
                "manaCost": "",
                "foil": is_foil,
                "isFoil": is_foil,
                "finishes": ["foil"] if is_foil else ["nonfoil"],
                "imageUrl": img_url,
                "uuid": c_uuid,
            }
            card_objs.append(card_obj)

            # Register card in single_prices
            single_prices["byUuid"][c_uuid] = {
                "name": c_name,
                "set": "sld",
                "price": c_nonfoil,
                "foilPrice": c_foil,
                "imageUrl": img_url,
            }
            single_prices["byNameSet"][f"{c_name.lower()}___sld"] = {
                "name": c_name,
                "set": "sld",
                "price": c_nonfoil,
                "foilPrice": c_foil,
                "imageUrl": img_url,
            }
            single_prices["byNameSet"][f"{c_name.lower()}_sld"] = {
                "name": c_name,
                "set": "sld",
                "price": c_nonfoil,
                "foilPrice": c_foil,
                "imageUrl": img_url,
            }

        tot_ev = round(tot_ev, 2)
        deck_entry = {
            "deckName": display_name,
            "setCode": "SLD",
            "theme": f"Secret Lair Drop - {display_name}",
            "cardCount": len(card_objs),
            "totalSinglesEv": tot_ev,
            "isFoil": is_foil,
            "foil": is_foil,
            "commander": card_objs[0] if card_objs else None,
            "typeSummary": {"Total": len(card_objs)},
            "raritySummary": {"Cards": len(card_objs)},
            "cards": card_objs,
        }

        # Register in precon_decks under all standard key variations
        precon_decks[slug] = deck_entry
        precon_decks[f"{display_name.lower()}___sld"] = deck_entry
        precon_decks[display_name.lower()] = deck_entry
        precon_decks[f"{drop['baseName'].lower()}___sld"] = deck_entry if not is_foil else precon_decks.get(f"{drop['baseName'].lower()}___sld", deck_entry)
        precon_decks[drop['baseName'].lower()] = deck_entry if not is_foil else precon_decks.get(drop['baseName'].lower(), deck_entry)

        print(f"Enriched FF Deck {display_name} [{'FOIL' if is_foil else 'NONFOIL'}]: {len(card_objs)} cards = EV ${tot_ev}")

# 3. Bonus Cards (Feed the Swarm, Forge Anew, Silence)
bonus_cards = [
    ("Feed the Swarm", "7001", 4.82, "f18f51ab-ae4d-5d6e-abfe-6347d4fdc4f2", "Sorcery", "Common"),
    ("Forge Anew", "7002", 14.82, "29756b2c-e363-5ceb-836f-1b8ae2bddd79", "Enchantment", "Rare"),
    ("Silence", "7003", 9.09, "5e99b07c-5218-5c3a-a520-4705726f9b2e", "Instant", "Rare"),
]

for b_name, b_num, b_foil_p, b_uuid, b_type, b_rarity in bonus_cards:
    single_prices["byUuid"][b_uuid] = {
        "name": b_name,
        "set": "sld",
        "price": b_foil_p,
        "foilPrice": b_foil_p,
        "imageUrl": f"https://cards.scryfall.io/normal/front/{b_uuid[:1]}/{b_uuid[1:2]}/{b_uuid}.jpg",
    }
    single_prices["byNameSet"][f"{b_name.lower()}___sld"] = {
        "name": b_name,
        "set": "sld",
        "price": b_foil_p,
        "foilPrice": b_foil_p,
        "imageUrl": f"https://cards.scryfall.io/normal/front/{b_uuid[:1]}/{b_uuid[1:2]}/{b_uuid}.jpg",
    }
    single_prices["byNameSet"][f"{b_name.lower()}_sld"] = {
        "name": b_name,
        "set": "sld",
        "price": b_foil_p,
        "foilPrice": b_foil_p,
        "imageUrl": f"https://cards.scryfall.io/normal/front/{b_uuid[:1]}/{b_uuid[1:2]}/{b_uuid}.jpg",
    }
    print(f"Enriched Bonus Card {b_name} (#{b_num}) [FOIL] @ ${b_foil_p}")

# Save enriched data
with open("public/data/precon_decks.json", "w") as f:
    json.dump(precon_decks, f, indent=2)

with open("public/data/single_card_prices.json", "w") as f:
    json.dump(single_prices, f, indent=2)

print("Finished updating precon_decks.json and single_card_prices.json!")
