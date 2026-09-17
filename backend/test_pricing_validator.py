import unittest

from validate_pricing_and_ev import should_skip_roi_anomaly


class PricingValidatorCoverageTests(unittest.TestCase):
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
