"""Focused contracts for product chase-card metadata export."""
import sys
import types
import unittest

if "mysql.connector" not in sys.modules:
    mysql_module = types.ModuleType("mysql")
    connector_module = types.ModuleType("mysql.connector")
    connector_module.Error = Exception
    mysql_module.connector = connector_module
    sys.modules["mysql"] = mysql_module
    sys.modules["mysql.connector"] = connector_module

from export_product_chase_cards import (
    STANDARD_CARD_BACK_ID,
    build_scryfall_image_url,
    load_card_metadata,
    normalize_card_back_id,
)


class FakeCursor:
    def __init__(self):
        self.query = ""
        self.params = []

    def execute(self, query, params):
        self.query = query
        self.params = params

    def fetchall(self):
        return [{"uuid": "card-uuid", "scryfallId": "front-uuid"}]


class ProductChaseCardContractTests(unittest.TestCase):
    def test_metadata_joins_card_identifiers_by_uuid(self):
        cursor = FakeCursor()

        metadata = load_card_metadata(cursor, ["card-uuid"])

        self.assertIn("LEFT JOIN cardIdentifiers ci ON ci.uuid = c.uuid", cursor.query)
        self.assertIn("ci.scryfallId", cursor.query)
        self.assertIn("ci.scryfallIllustrationId", cursor.query)
        self.assertIn("ci.scryfallCardBackId", cursor.query)
        self.assertEqual(metadata["card-uuid"]["scryfallId"], "front-uuid")

    def test_standard_card_back_is_not_a_second_face(self):
        self.assertEqual(normalize_card_back_id(STANDARD_CARD_BACK_ID), "")
        self.assertEqual(normalize_card_back_id("double-faced-back-uuid"), "double-faced-back-uuid")

    def test_image_urls_are_uuid_and_face_specific(self):
        card_id = "abc123"
        self.assertEqual(
            build_scryfall_image_url(card_id),
            "https://cards.scryfall.io/normal/front/a/b/abc123.jpg",
        )
        self.assertEqual(
            build_scryfall_image_url(card_id, "back"),
            "https://cards.scryfall.io/normal/back/a/b/abc123.jpg",
        )


if __name__ == "__main__":
    unittest.main()