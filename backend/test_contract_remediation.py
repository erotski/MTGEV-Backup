import unittest

from composite_evaluator import (
    calculate_fixed_ev,
    resolve_product_contents,
    resolve_total_card_count,
    resolve_variable_slot,
)
from export_product_metrics import build_product_metrics


class ContractRemediationTests(unittest.TestCase):
    def test_variable_slot_does_not_borrow_another_vendor_booster(self):
        slot = {
            "configs": [{
                "variable_config": [{"chance": 1}],
                "pack": [{"set": "TST", "code": "collector", "count": 1}],
            }],
        }
        aggregate_only_lookup = {
            ("TST", "collector", "all_cheapest", "direct"): {
                "quantiles": [1.0] * 100,
                "evAverage": 1.0,
            },
        }

        result = resolve_variable_slot(slot, {}, aggregate_only_lookup, {}, vendor="tcgplayer")

        self.assertIsNone(result)

    def test_variable_slot_uses_exact_vendor_booster(self):
        slot = {
            "configs": [{
                "variable_config": [{"chance": 1}],
                "pack": [{"set": "TST", "code": "collector", "count": 1}],
            }],
        }
        lookup = {
            ("TST", "collector", "tcgplayer", "direct"): {
                "quantiles": [1.0] * 100,
                "evAverage": 1.0,
            },
        }

        result = resolve_variable_slot(slot, {}, lookup, {}, vendor="tcgplayer")

        self.assertEqual(result[0]["pack_specs"][0][2], 1.0)

    def test_product_metrics_omit_missing_market_price(self):
        products = [{
            "id": "no-price",
            "marketPrice": 0,
            "metricsByVendor": {
                "all_cheapest": {
                    "mean": 10,
                    "median": 10,
                    "min": 10,
                    "p05": 10,
                    "p95": 10,
                    "max": 10,
                    "evScore": 100,
                    "breakevenPercentile": 1,
                },
            },
        }]

        self.assertEqual(build_product_metrics(products), [])

    def test_unresolved_sealed_child_marks_contents_incomplete(self):
        products = {
            "parent": {
                "id": "parent",
                "setCode": "TST",
                "contents": {"sealed": [{"uuid": "missing", "count": 1}]},
            },
        }

        result = resolve_product_contents("parent", products)

        self.assertFalse(result["complete"])
        self.assertEqual(result["packs"], {})

    def test_unmatched_deck_does_not_receive_a_guessed_card_count(self):
        total, complete = resolve_total_card_count([], [{"name": "Unknown Deck"}], {}, {})

        self.assertEqual(total, 0)
        self.assertFalse(complete)

    def test_fixed_card_vendor_fallback_records_resolution_source(self):
        provenance = {}
        value = calculate_fixed_ev(
            [{"uuid": "card-1", "name": "Card One", "count": 1}],
            [],
            {"byUuid": {"card-1": {"prices": {"cardmarket": 3.5}}}},
            {},
            vendor="tcgplayer",
            provenance=provenance,
        )

        self.assertEqual(value, 3.5)
        self.assertEqual(provenance["cardResolutions"], [{
            "uuid": "card-1",
            "name": "Card One",
            "count": 1,
            "status": "vendor_fallback",
            "requestedVendor": "tcgplayer",
            "resolvedVendor": "cardmarket",
        }])


if __name__ == "__main__":
    unittest.main()