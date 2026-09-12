"""Export backend-resolved TOP 5 product chase cards.

Card candidates come from MySQL booster sheets, sealed-product contents, and
preconstructed deck contents. Prices come from local single_card_prices.json.
Scryfall is represented only by existing image/scryfall metadata.
"""
import json
from pathlib import Path

import mysql.connector

from config import DB_CONFIG

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "public" / "data"
OUTPUT_PATH = DATA_DIR / "product_chase_cards.json"
VENDORS = ("all_cheapest", "all_average", "tcgplayer", "cardmarket", "cardkingdom", "manapool")
MODES = ("direct", "cheapest_reprint")


def load_json(name):
    path = DATA_DIR / name
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_booster_candidates(cursor):
    cursor.execute(
        """
        SELECT sbc.setCode, sbc.boosterName, sbsc.cardUuid,
               COALESCE(sbs.sheetIsFoil, 0) AS isFoil
        FROM setBoosterSheetCards sbsc
        JOIN setBoosterSheets sbs
          ON sbs.setCode = sbsc.setCode
         AND sbs.boosterName = sbsc.boosterName
         AND sbs.sheetName = sbsc.sheetName
        JOIN setBoosterContents sbc
          ON sbc.setCode = sbsc.setCode
         AND sbc.boosterName = sbsc.boosterName
         AND sbc.sheetName = sbsc.sheetName
        """
    )
    candidates = {}
    for row in cursor.fetchall():
        key = ((row["setCode"] or "").upper(), (row["boosterName"] or "").lower())
        candidates.setdefault(key, set()).add((row["cardUuid"], bool(row["isFoil"])))
    return candidates


def load_deck_candidates(cursor):
    cursor.execute(
        """
        SELECT dk.name AS deckName, dk.code AS deckCode,
               c.uuid AS cardUuid, dc.isFoil AS isFoil
        FROM deckCards dc
        JOIN decks dk ON dk.id = dc.deckId
        JOIN cards c ON c.uuid = dc.cardUuid
        """
    )
    decks = {}
    for row in cursor.fetchall():
        key = ((row["deckName"] or "").strip().lower(), (row["deckCode"] or "").upper())
        decks.setdefault(key, set()).add((row["cardUuid"], bool(row["isFoil"])))
    return decks


def load_card_metadata(cursor, uuids):
    metadata = {}
    uuid_list = list(uuids)
    for start in range(0, len(uuid_list), 1000):
        batch = uuid_list[start:start + 1000]
        placeholders = ",".join(["%s"] * len(batch))
        cursor.execute(
            f"SELECT uuid, name FROM cards WHERE uuid IN ({placeholders})", batch
        )
        metadata.update({row["uuid"]: row for row in cursor.fetchall()})
    return metadata


def price_for(record, vendor, mode, is_foil):
    prices = record.get("prices") or {}
    if mode == "cheapest_reprint":
        normal = prices.get("all_cheapest") or prices.get("all") or 0
    else:
        normal = prices.get(vendor) or 0
    if is_foil:
        foil_key = f"{vendor}Foil"
        normal = prices.get(foil_key) or record.get("priceFoil") or normal
    return float(normal or 0)


def make_card(uuid, is_foil, metadata, prices, vendor, mode):
    record = prices.get("byUuid", {}).get(uuid)
    if not record:
        return None
    price = price_for(record, vendor, mode, is_foil)
    return {
        "uuid": uuid,
        "name": record.get("name") or metadata.get(uuid, {}).get("name") or "",
        "setCode": (record.get("set") or "").upper(),
        "finish": "foil" if is_foil else "nonfoil",
        "price": round(price, 2),
        "scryfallId": record.get("scryfallId", ""),
        "imageUrl": record.get("imageUrl", ""),
    }


def resolve_product(product, products_by_id, booster_candidates, deck_candidates, seen=None):
    seen = set() if seen is None else seen
    product_id = product.get("id") or product.get("uuid")
    if product_id in seen:
        return set()
    seen.add(product_id)
    contents = product.get("contents") or {}
    candidates = set()

    for pack in contents.get("pack", []):
        key = ((pack.get("set") or product.get("setCode") or "").upper(),
               (pack.get("code") or "play").lower())
        candidates.update(booster_candidates.get(key, set()))

    for card in contents.get("card", []):
        if card.get("uuid"):
            candidates.add((card["uuid"], bool(card.get("foil"))))

    for deck in contents.get("deck", []):
        key = ((deck.get("name") or "").strip().lower(),
               (deck.get("set") or product.get("setCode") or "").upper())
        candidates.update(deck_candidates.get(key, set()))

    for variable in contents.get("variable", []):
        for config in variable.get("configs", []):
            for card in config.get("card", []):
                if card.get("uuid"):
                    candidates.add((card["uuid"], bool(card.get("foil"))))

    for sealed in contents.get("sealed", []):
        child_id = sealed.get("uuid")
        child = products_by_id.get(child_id)
        if child:
            candidates.update(resolve_product(child, products_by_id, booster_candidates, deck_candidates, seen.copy()))

    return candidates


def export_product_chase_cards():
    prices = load_json("single_card_prices.json")
    products = load_json("sealed_products.json")
    products_by_id = {p.get("id") or p.get("uuid"): p for p in products if p.get("id") or p.get("uuid")}

    connection = mysql.connector.connect(**DB_CONFIG)
    cursor = connection.cursor(dictionary=True)
    try:
        booster_candidates = load_booster_candidates(cursor)
        deck_candidates = load_deck_candidates(cursor)
        all_uuids = {uuid for values in booster_candidates.values() for uuid, _ in values}
        all_uuids.update(uuid for values in deck_candidates.values() for uuid, _ in values)
        metadata = load_card_metadata(cursor, all_uuids)

        output = {}
        for product in products:
            product_id = product.get("id") or product.get("uuid")
            if not product_id:
                continue
            candidates = resolve_product(product, products_by_id, booster_candidates, deck_candidates)
            product_result = {}
            for mode in MODES:
                for vendor in VENDORS:
                    cards = [
                        card for uuid, is_foil in candidates
                        if (card := make_card(uuid, is_foil, metadata, prices, vendor, mode))
                        and card["price"] > 0
                    ]
                    cards.sort(key=lambda card: card["price"], reverse=True)
                    product_result[f"{mode}:{vendor}"] = cards[:5]
            output[product_id] = product_result

        with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
            json.dump(output, handle, indent=2)
        print(f"  OK Exported chase cards for {len(output)} products to {OUTPUT_PATH}")
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    export_product_chase_cards()
