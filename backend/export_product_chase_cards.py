"""Export backend-resolved TOP 5 product chase cards.

Card candidates come from MySQL booster sheets, sealed-product contents, and
preconstructed deck contents. Prices are resolved directly from MySQL for
every discovered candidate uuid, the same tables the booster EV simulation
uses, so booster-sheet cards are actually priced instead of silently
skipped. Scryfall artwork is supplemented from single_card_prices.json when
available.
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
NAMED_VENDORS = ("tcgplayer", "cardmarket", "cardkingdom", "manapool")
EUR_USD_RATE = 1.09


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
    decks = {}
    try:
        cursor.execute(
            """
            SELECT dk.name AS deckName, dk.code AS deckCode,
                   c.uuid AS cardUuid, dc.isFoil AS isFoil
            FROM deckCards dc
            JOIN decks dk ON dk.id = dc.deckId
            JOIN cards c ON c.uuid = dc.cardUuid
            """
        )
        for row in cursor.fetchall():
            key = ((row["deckName"] or "").strip().lower(), (row["deckCode"] or "").upper())
            decks.setdefault(key, set()).add((row["cardUuid"], bool(row["isFoil"])))
    except mysql.connector.Error as error:
        print(f"  INFO Deck tables unavailable; using precon_decks.json for deck candidates: {error}")
    return decks


def load_local_deck_candidates():
    raw = load_json("precon_decks.json")
    deck_data = raw.get("decks", raw) if isinstance(raw, dict) else {}
    candidates = {}
    for deck in deck_data.values():
        if not isinstance(deck, dict):
            continue
        name = (deck.get("deckName") or deck.get("name") or "").strip().lower()
        code = (deck.get("setCode") or deck.get("set") or "").strip().upper()
        cards = deck.get("cards") or deck.get("fullDecklist") or []
        if not name:
            continue
        key = (name, code)
        for card in cards:
            uuid = card.get("uuid")
            if uuid:
                candidates.setdefault(key, set()).add((uuid, bool(card.get("foil") or card.get("isFoil"))))
    return candidates


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


def load_direct_prices(cursor, uuids):
    """Direct-mode named-vendor prices resolved straight from MySQL for the
    exact candidate uuids, so booster-sheet cards get priced too (not just
    the cards already indexed in single_card_prices.json)."""
    prices = {}
    uuid_list = list(uuids)
    for start in range(0, len(uuid_list), 1000):
        batch = uuid_list[start:start + 1000]
        placeholders = ",".join(["%s"] * len(batch))
        cursor.execute(
            f"""
            SELECT uuid, provider AS seller, finish, price
            FROM prices
            WHERE uuid IN ({placeholders})
              AND (source = 'paper' OR source IS NULL)
              AND (priceType = 'retail' OR priceType IS NULL)
              AND price > 0
            """,
            batch,
        )
        for row in cursor.fetchall():
            seller = (row.get("seller") or "").lower()
            finish = (row.get("finish") or "").strip().replace("nonfoil", "normal").lower()
            if seller not in NAMED_VENDORS or not finish:
                continue
            prices.setdefault(row["uuid"], {}).setdefault(seller, {})[finish] = float(row["price"])
    return prices


def load_reprint_prices(cursor, uuids):
    """Cheapest-reprint-mode named-vendor prices from the precomputed
    lowest_prices table, keyed directly by uuid."""
    prices = {}
    uuid_list = list(uuids)
    for start in range(0, len(uuid_list), 1000):
        batch = uuid_list[start:start + 1000]
        placeholders = ",".join(["%s"] * len(batch))
        cursor.execute(
            f"""
            SELECT uuid, seller, cardfinish, price
            FROM lowest_prices
            WHERE uuid IN ({placeholders}) AND price > 0
            """,
            batch,
        )
        for row in cursor.fetchall():
            seller = (row.get("seller") or "").lower()
            finish = (row.get("cardfinish") or "").strip().replace("nonfoil", "normal").lower()
            if seller not in NAMED_VENDORS or not finish:
                continue
            prices.setdefault(row["uuid"], {}).setdefault(seller, {})[finish] = float(row["price"])
    return prices


def resolve_vendor_prices(vendor_finish_map, is_foil):
    """Convert {seller: {finish: price}} into vendor keys plus computed
    all_cheapest/all_average aggregates for one card in one price mode."""
    finish_key = "foil" if is_foil else "normal"
    resolved = {}
    for seller in NAMED_VENDORS:
        val = (vendor_finish_map.get(seller) or {}).get(finish_key)
        if val is None:
            continue
        if seller == "cardmarket":
            resolved["cardmarketEur"] = round(val, 2)
            resolved["cardmarket"] = round(val * EUR_USD_RATE, 2)
        else:
            resolved[seller] = round(val, 2)

    valid_vals = [v for k, v in resolved.items() if k in NAMED_VENDORS and v > 0]
    if valid_vals:
        resolved["all_cheapest"] = round(min(valid_vals), 2)
        resolved["all_average"] = round(sum(valid_vals) / len(valid_vals), 2)
    return resolved


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
    display_metadata = (load_json("single_card_prices.json") or {}).get("byUuid", {})
    products = load_json("sealed_products.json")
    products_by_id = {p.get("id") or p.get("uuid"): p for p in products if p.get("id") or p.get("uuid")}

    connection = mysql.connector.connect(**DB_CONFIG)
    cursor = connection.cursor(dictionary=True)
    try:
        booster_candidates = load_booster_candidates(cursor)
        deck_candidates = load_deck_candidates(cursor)
        if not deck_candidates:
            deck_candidates = load_local_deck_candidates()

        # Resolve every product's candidates up front so the price/metadata
        # queries below cover booster-sheet, deck, direct-card, and
        # variable-slot cards together instead of only booster/deck uuids.
        product_candidates = {}
        all_uuids = set()
        for product in products:
            product_id = product.get("id") or product.get("uuid")
            if not product_id:
                continue
            candidates = resolve_product(product, products_by_id, booster_candidates, deck_candidates)
            product_candidates[product_id] = candidates
            all_uuids.update(uuid for uuid, _ in candidates)

        metadata = load_card_metadata(cursor, all_uuids)
        mode_prices = {
            "direct": load_direct_prices(cursor, all_uuids),
            "cheapest_reprint": load_reprint_prices(cursor, all_uuids),
        }

        output = {}
        for product_id, candidates in product_candidates.items():
            product_result = {}
            for mode in MODES:
                resolved_by_card = {}
                for uuid, is_foil in candidates:
                    vendor_finish_map = mode_prices[mode].get(uuid)
                    if not vendor_finish_map:
                        continue
                    resolved_by_card[(uuid, is_foil)] = resolve_vendor_prices(vendor_finish_map, is_foil)

                for vendor in VENDORS:
                    cards = []
                    for (uuid, is_foil), resolved in resolved_by_card.items():
                        price = resolved.get(vendor) or 0.0
                        if price <= 0:
                            continue
                        meta = metadata.get(uuid, {})
                        display = display_metadata.get(uuid, {})
                        cards.append({
                            "uuid": uuid,
                            "name": meta.get("name") or display.get("name") or "",
                            "setCode": (display.get("set") or "").upper(),
                            "finish": "foil" if is_foil else "nonfoil",
                            "price": round(price, 2),
                            "scryfallId": display.get("scryfallId", ""),
                            "imageUrl": display.get("imageUrl", ""),
                        })
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
