"""Load published preconstructed deck data into the temporary MySQL schema."""
import json
from pathlib import Path

import mysql.connector

from config import DB_CONFIG

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT_DIR / "public" / "data" / "precon_decks.json"


def load_deck_data():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Missing deck snapshot: {DATA_PATH}")
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    return raw.get("decks", raw) if isinstance(raw, dict) else {}


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
    decks = load_deck_data()
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
