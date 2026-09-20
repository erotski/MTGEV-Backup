import unittest

from product_taxonomy import classify_product, validate_product_taxonomy_contract, validate_taxonomy_overrides


class ProductTaxonomyTests(unittest.TestCase):
    def test_structured_category_is_primary_and_other_signals_add_tags(self):
        result = classify_product({
            "displayName": "March of the Machine Jumpstart Booster Box",
            "category": "booster_box",
            "subtype": "jumpstart",
            "contents": {"sealed": [{"count": 24, "name": "Jumpstart Booster Pack"}]},
        })

        self.assertEqual(result["primaryCategory"], "booster_box")
        self.assertIn("booster_box", result["categoryTags"])
        self.assertIn("jumpstart", result["categoryTags"])
        self.assertIn("contains_sealed_products", result["categoryTags"])

    def test_name_is_only_a_primary_fallback(self):
        result = classify_product({
            "displayName": "Example Collector Booster Box",
            "category": "unknown",
            "subtype": "collector",
            "contents": {"pack": [{"count": 12, "code": "collector"}]},
        })

        self.assertEqual(result["primaryCategory"], "booster_box")
        self.assertIn("collector", result["categoryTags"])
        self.assertIn("contains_packs", result["categoryTags"])
        self.assertIn("name_primary_fallback", result["classificationSignals"])

    def test_conflicting_name_does_not_replace_structured_category(self):
        result = classify_product({
            "displayName": "Incorrectly Named Booster Case",
            "category": "booster_box",
        })

        self.assertEqual(result["primaryCategory"], "booster_box")
        self.assertEqual(
            result["classificationWarnings"],
            ["category_name_conflict:booster_box:booster_case"],
        )

    def test_override_can_change_primary_and_adjust_tags(self):
        result = classify_product(
            {"displayName": "Special Product", "category": "box_set"},
            {
                "primaryCategory": "bundle",
                "addTags": ["secret_lair", "gift"],
                "removeTags": ["box_set"],
            },
        )

        self.assertEqual(result["primaryCategory"], "bundle")
        self.assertEqual(result["classificationSource"], "override")
        self.assertIn("bundle", result["categoryTags"])
        self.assertIn("secret_lair", result["categoryTags"])
        self.assertNotIn("box_set", result["categoryTags"])

    def test_contents_can_identify_deck_when_metadata_is_unknown(self):
        result = classify_product({
            "displayName": "Special Product",
            "category": "unknown",
            "contents": {"deck": [{"name": "Deck A"}, {"name": "Deck B"}]},
        })

        self.assertEqual(result["primaryCategory"], "multiple_decks")
        self.assertIn("contains_decks", result["categoryTags"])
        self.assertIn("preconstructed_deck", result["categoryTags"])

    def test_commander_and_other_decks_are_separate_filters(self):
        commander = classify_product({
            "displayName": "Example Commander Deck",
            "category": "deck",
            "subtype": "commander",
        })
        starter = classify_product({
            "displayName": "Example Starter Deck",
            "category": "deck",
            "subtype": "starter_deck",
        })

        self.assertIn("commander_deck", commander["categoryTags"])
        self.assertNotIn("preconstructed_deck", commander["categoryTags"])
        self.assertIn("preconstructed_deck", starter["categoryTags"])

    def test_special_collections_exclude_secret_lair(self):
        collection = classify_product({"displayName": "Example Collection", "category": "box_set"})
        secret_lair = classify_product({"displayName": "Secret Lair Drop Example", "category": "box_set"})

        self.assertIn("special_collection", collection["categoryTags"])
        self.assertNotIn("special_collection", secret_lair["categoryTags"])
        self.assertIn("secret_lair", secret_lair["categoryTags"])

    def test_sample_promotional_and_topper_products_share_filter_tag(self):
        for subtype in ("sample_pack", "promotional", "topper"):
            with self.subTest(subtype=subtype):
                result = classify_product({
                    "displayName": "Example Product",
                    "category": "booster_pack",
                    "subtype": subtype,
                })
                self.assertIn("sample_promo_topper", result["categoryTags"])

    def test_invalid_override_tag_shape_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "addTags must be an array"):
            classify_product(
                {"displayName": "Special Product", "category": "box_set"},
                {"addTags": "secret_lair"},
            )

    def test_cross_snapshot_taxonomy_must_match_sealed_product(self):
        sealed = [{
            "id": "product-1",
            "primaryCategory": "booster_box",
            "categoryTags": ["booster_box", "jumpstart"],
        }]

        validate_product_taxonomy_contract(sealed, {
            "product_metrics.json": [{
                "productUuid": "product-1",
                "primaryCategory": "booster_box",
                "categoryTags": ["booster_box", "jumpstart"],
            }],
        })

        with self.assertRaisesRegex(ValueError, "taxonomy differs"):
            validate_product_taxonomy_contract(sealed, {
                "arbitrage_leaderboard.json": [{
                    "productUuid": "product-1",
                    "primaryCategory": "booster_case",
                    "categoryTags": ["booster_case"],
                }],
            })

    def test_override_must_reference_an_existing_product(self):
        with self.assertRaisesRegex(ValueError, "unknown product UUID"):
            validate_taxonomy_overrides([{"id": "product-1"}], {"missing": {"addTags": ["gift"]}})


if __name__ == "__main__":
    unittest.main()