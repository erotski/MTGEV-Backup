import unittest

from validate_pricing_and_ev import build_diagnostics, build_precon_index, should_skip_roi_anomaly


class PricingValidatorCoverageTests(unittest.TestCase):
    def test_compact_precon_index_resolves_display_name(self):
        index = build_precon_index({
            "_format": "compact",
            "decks": {
                "Eldrazi_Incursion___M3C": {
                    "deckName": "Eldrazi Incursion",
                    "setCode": "M3C",
                    "totalSinglesEv": 142.58,
                },
            },
            "aliases": {"Eldrazi Incursion Commander Deck": "Eldrazi_Incursion___M3C"},
        })

        self.assertEqual(index["eldrazi incursion"]["totalSinglesEv"], 142.58)
        self.assertEqual(index["eldrazi incursion commander deck"]["setCode"], "M3C")

    def test_diagnostic_counts_match_serialized_issue_lists(self):
        diagnostics = build_diagnostics(
            [{"id": "booster-1"}],
            [{"id": "product-1"}, {"id": "product-2"}],
            [{"id": "roi-1"}, {"id": "roi-2"}, {"id": "roi-3"}],
        )

        self.assertEqual(diagnostics["boosterSkewCount"], len(diagnostics["boosterSkewIssues"]))
        self.assertEqual(diagnostics["evMismatchCount"], len(diagnostics["evMismatchIssues"]))
        self.assertEqual(diagnostics["roiAnomalyCount"], len(diagnostics["roiAnomalyIssues"]))

    def test_skips_low_coverage_mixed_bundle(self):
        product = {
            "displayName": "Secret Lair Bundle Second Secretversary The Bundled Bundle",
            "category": "box_set",
            "marketPrice": 0.0,
            "totalEvAvg": 1823.07,
            "fixedPricingByVendor": {
                "all_cheapest": {"coveragePct": 4.19},
                "all_average": {"coveragePct": 4.19},
                "tcgplayer": {"coveragePct": 4.19},
            },
        }
        self.assertTrue(should_skip_roi_anomaly(product))

    def test_keeps_high_coverage_product(self):
        product = {
            "displayName": "Example Booster Box",
            "category": "booster_box",
            "marketPrice": 100.0,
            "totalEvAvg": 180.0,
            "fixedPricingByVendor": {
                "all_cheapest": {"coveragePct": 96.0},
            },
        }
        self.assertFalse(should_skip_roi_anomaly(product))


if __name__ == "__main__":
    unittest.main()
