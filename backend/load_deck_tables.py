"""Load published preconstructed deck data into the temporary MySQL schema."""
import json
import sys
from pathlib import Path

import mysql.connector

from config import DB_CONFIG

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT_DIR / "public" / "data" / "precon_decks.json"
ALL_PRICES_PATH = Path("/tmp/AllPricesToday.json")
NAMED_VENDORS = ("tcgplayer", "cardmarket", "cardkingdom", "manapool")

sys.path.insert(0, str(ROOT_DIR / "scripts"))
from deck_price_provenance import resolve_fixed_card_prices


def load_deck_data():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Missing deck snapshot: {DATA_PATH}")
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    return raw.get("decks", raw) if isinstance(raw, dict) else {}


def enrich_deck_prices(decks, all_prices_data=None):
    """Annotate fixed deck cards with explicit fallback provenance."""
    for deck in decks.values():
        if not isinstance(deck, dict):
            continue
        cards = deck.get("cards") or deck.get("fullDecklist") or []
        summary = {}
        for card in cards:
            prices = card.get("prices") or {}
            original_prices = dict(prices)
            if all_prices_data is not None and card.get("uuid"):
                resolved_prices, resolved_provenance = resolve_fixed_card_prices(
                    all_prices_data,
                    card["uuid"],
                    want_foil=bool(card.get("foil") or card.get("isFoil")),
                )
                prices.update(resolved_prices)
                card["prices"] = prices
            else:
                resolved_provenance = None
            provenance = {}
            for vendor in NAMED_VENDORS:
                value = prices.get(vendor)
                available_neighbors = [
                    other for other in NAMED_VENDORS
                    if isinstance(prices.get(other), (int, float)) and prices[other] > 0
                ]
                if resolved_provenance and vendor in resolved_provenance:
                    status = resolved_provenance[vendor]["status"]
                    resolved_vendor = resolved_provenance[vendor].get("resolvedVendor")
                    if status != "unpriced" and resolved_vendor and not isinstance(value, (int, float)):
                        prices[vendor] = prices.get(resolved_vendor, 0)
                elif isinstance(value, (int, float)) and value > 0:
                    status = "exact"
                    resolved_vendor = vendor
                elif available_neighbors:
                    status = "vendor_fallback"
                    resolved_vendor = available_neighbors[0]
                    prices[vendor] = prices[resolved_vendor]
                else:
                    status = "unpriced"
                    resolved_vendor = None
                provenance[vendor] = {
                    "status": status,
                    "requestedVendor": vendor,
                    "resolvedVendor": resolved_vendor,
                    "requestedFinish": "foil" if card.get("foil") or card.get("isFoil") else "normal",
                    "resolvedFinish": "foil" if card.get("foil") or card.get("isFoil") else "normal",
                }
            card_provenance = resolved_provenance or provenance
            exact_named = all(card_provenance[v]["status"] == "exact" for v in NAMED_VENDORS)
            card_provenance["all_average"] = {
                "status": "exact" if exact_named else "vendor_fallback",
                "requestedVendor": "all_average",
                "resolvedVendor": None,
                "requestedFinish": "foil" if card.get("foil") or card.get("isFoil") else "normal",
                "resolvedFinish": "foil" if card.get("foil") or card.get("isFoil") else "normal",
            }
            card["priceProvenance"] = card_provenance
            count = int(card.get("count", 1) or 1)
            for vendor in NAMED_VENDORS:
                stats = summary.setdefault(vendor, {"expectedCards": 0, "exactCards": 0, "fallbackCards": 0, "missingCards": 0, "observedEv": 0.0, "fallbackCompletedEv": 0.0})
                stats["expectedCards"] += count
                stats["observedEv"] += float(original_prices.get(vendor) or 0.0) * count
                stats["fallbackCompletedEv"] += float(prices.get(vendor) or 0.0) * count
                status = card_provenance[vendor]["status"]
                if status == "exact":
                    stats["exactCards"] += count
                elif status == "unpriced":
                    stats["missingCards"] += count
                else:
                    stats["fallbackCards"] += count
        for stats in summary.values():
            expected = stats["expectedCards"]
            stats["observedEv"] = round(stats["observedEv"], 2)
            stats["fallbackCompletedEv"] = round(stats["fallbackCompletedEv"], 2)
            stats["coveragePct"] = round((expected - stats["missingCards"]) / expected * 100, 2) if expected else 0.0
            stats["status"] = "missing" if stats["missingCards"] else ("fallback_used" if stats["fallbackCards"] else "exact")
        if summary:
            average_stats = {
                "expectedCards": next(iter(summary.values()))["expectedCards"],
                "exactCards": min(item["exactCards"] for item in summary.values()),
                "fallbackCards": max(item["fallbackCards"] for item in summary.values()),
                "missingCards": max(item["missingCards"] for item in summary.values()),
                "observedEv": round(sum(item["observedEv"] for item in summary.values()) / len(summary), 2),
                "fallbackCompletedEv": round(sum(item["fallbackCompletedEv"] for item in summary.values()) / len(summary), 2),
            }
            average_stats["coveragePct"] = round((average_stats["expectedCards"] - average_stats["missingCards"]) / average_stats["expectedCards"] * 100, 2)
            average_stats["status"] = "missing" if average_stats["missingCards"] else ("fallback_used" if average_stats["fallbackCards"] else "exact")
            summary["all_average"] = average_stats
        deck["pricingReliability"] = summary
    return decks


def create_tables(cursor):
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS decks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            code VARCHAR(32) NOT NULL,
            UNIQUE KEY uq_decks_name_code (name, code)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS deckCards (
            deckId INT NOT NULL,
            cardUuid CHAR(36) NOT NULL,
            count INT NOT NULL DEFAULT 1,
            isFoil BOOLEAN NOT NULL DEFAULT FALSE,
            PRIMARY KEY (deckId, cardUuid, isFoil),
            CONSTRAINT fk_deck_cards_deck
                FOREIGN KEY (deckId) REFERENCES decks(id)
                ON DELETE CASCADE
        )
        """
    )


def load_tables():
    all_prices_data = None
    if ALL_PRICES_PATH.exists():
        with ALL_PRICES_PATH.open("r", encoding="utf-8") as handle:
            all_prices_data = json.load(handle).get("data", {})
    decks = enrich_deck_prices(load_deck_data(), all_prices_data)
    with DATA_PATH.open("w", encoding="utf-8") as handle:
        json.dump({"_format": "compact", "decks": decks}, handle, indent=2)
    connection = mysql.connector.connect(**DB_CONFIG)
    cursor = connection.cursor(dictionary=True)
    try:
        create_tables(cursor)
        cursor.execute("DELETE FROM deckCards")
        cursor.execute("DELETE FROM decks")

        loaded_decks = 0
        loaded_cards = 0
        seen = set()
        for deck in decks.values():
            if not isinstance(deck, dict):
                continue
            name = (deck.get("deckName") or deck.get("name") or "").strip()
            code = (deck.get("setCode") or deck.get("set") or "").strip().upper()
            if not name or not code:
                continue
            identity = (name.lower(), code)
            if identity in seen:
                continue
            seen.add(identity)

            cursor.execute(
                "INSERT INTO decks (name, code) VALUES (%s, %s)",
                (name, code),
            )
            deck_id = cursor.lastrowid
            loaded_decks += 1

            cards = deck.get("cards") or deck.get("fullDecklist") or []
            for card in cards:
                uuid = card.get("uuid")
                if not uuid:
                    continue
                cursor.execute(
                    """
                    INSERT INTO deckCards (deckId, cardUuid, count, isFoil)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE count = VALUES(count)
                    """,
                    (
                        deck_id,
                        uuid,
                        int(card.get("count", 1) or 1),
                        bool(card.get("foil") or card.get("isFoil")),
                    ),
                )
                loaded_cards += 1

        connection.commit()
        print(f"  OK Loaded {loaded_decks} decks and {loaded_cards} deck cards into MySQL")
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    load_tables()
