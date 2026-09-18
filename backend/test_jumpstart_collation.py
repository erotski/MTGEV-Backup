import unittest

import numpy as np

from composite_evaluator import calculate_discrete_profit_metrics
from populate_booster_ev_to_db import (
    allocate_booster_indices,
    build_configuration_outcomes,
    select_sheet_indices,
)


class JumpstartCollationTests(unittest.TestCase):
    def test_equal_weight_variants_receive_equal_sample_counts(self):
        boosters = [{"weight": 1} for _ in range(10)]

        indices = allocate_booster_indices(boosters, 1234)

        counts = np.bincount(indices)
        self.assertEqual(len(indices), 1234)
        np.testing.assert_array_equal(counts, [124, 124, 124, 124, 123, 123, 123, 123, 123, 123])

    def test_weighted_variants_use_largest_remainder_allocation(self):
        boosters = [{"weight": 1}, {"weight": 2}, {"weight": 3}]

        indices = allocate_booster_indices(boosters, 10)

        np.testing.assert_array_equal(np.bincount(indices), [2, 3, 5])

    def test_fixed_sheet_uses_exact_card_multiplicities(self):
        sheet = {
            "fixed": True,
            "fixed_indices": np.array([0, 1, 1, 2]),
            "uuids": ["card-a", "card-b", "card-c"],
            "weights": np.array([0.25, 0.5, 0.25]),
        }

        first = select_sheet_indices(sheet, 4)
        second = select_sheet_indices(sheet, 4)

        np.testing.assert_array_equal(first, [0, 1, 1, 2])
        np.testing.assert_array_equal(second, first)

    def test_fixed_sheet_warns_and_resizes_card_count_mismatch(self):
        sheet = {
            "fixed": True,
            "fixed_indices": np.array([0, 1]),
            "uuids": ["card-a", "card-b"],
            "weights": np.array([0.5, 0.5]),
        }

        with self.assertWarnsRegex(RuntimeWarning, "defines 2 cards.*require 5"):
            indices = select_sheet_indices(sheet, 5, "infantry1")

        np.testing.assert_array_equal(indices, [0, 1, 0, 1, 0])

    def test_variable_sheet_samples_according_to_card_weights(self):
        np.random.seed(7)
        sheet = {
            "fixed": False,
            "fixed_indices": None,
            "uuids": ["rare", "mythic"],
            "weights": np.array([0.75, 0.25]),
        }

        indices = select_sheet_indices(sheet, 5000)
        rare_ratio = np.count_nonzero(indices == 0) / len(indices)

        self.assertGreater(rare_ratio, 0.72)
        self.assertLess(rare_ratio, 0.78)

    def test_fully_fixed_configurations_emit_discrete_outcomes(self):
        boosters = [
            {"weight": 1, "contents": {"themeA": 2}},
            {"weight": 3, "contents": {"themeB": 2}},
        ]
        sheet_data = {
            "themeA": {
                "fixed": True,
                "fixed_indices": np.array([0, 1]),
                "matrix": {"direct": {"all_cheapest": [1.25, 2.75]}},
                "status": {"direct": {"all_cheapest": ["exact", "exact"]}},
            },
            "themeB": {
                "fixed": True,
                "fixed_indices": np.array([0, 1]),
                "matrix": {"direct": {"all_cheapest": [4.0, 6.0]}},
                "status": {"direct": {"all_cheapest": ["exact", "finish_fallback"]}},
            },
        }

        distribution_type, outcomes = build_configuration_outcomes(
            boosters, sheet_data, ["direct"], ["all_cheapest"]
        )

        self.assertEqual(distribution_type, "discrete_fixed_configurations")
        self.assertEqual(
            outcomes["direct"]["all_cheapest"],
            [
                {
                    "configurationIndex": 0,
                    "label": "themeA",
                    "sheetNames": ["themeA"],
                    "fixedSheetNames": ["themeA"],
                    "weight": 1.0,
                    "probability": 0.25,
                    "ev": 4.0,
                    "complete": True,
                    "statusCounts": {"exact": 2},
                },
                {
                    "configurationIndex": 1,
                    "label": "themeB",
                    "sheetNames": ["themeB"],
                    "fixedSheetNames": ["themeB"],
                    "weight": 3.0,
                    "probability": 0.75,
                    "ev": 10.0,
                    "complete": True,
                    "statusCounts": {"exact": 1, "finish_fallback": 1},
                },
            ],
        )

    def test_single_variable_pick_emits_enumerated_mixed_outcomes(self):
        boosters = [{"weight": 1, "contents": {"theme": 2, "rare": 1}}]
        sheet_data = {
            "theme": {
                "fixed": True,
                "fixed_indices": np.array([0, 1]),
                "matrix": {"direct": {"all_cheapest": [1.0, 2.0]}},
                "status": {"direct": {"all_cheapest": ["exact", "exact"]}},
            },
            "rare": {
                "fixed": False,
                "uuids": ["rare-a", "rare-b"],
                "weights": np.array([0.75, 0.25]),
                "matrix": {"direct": {"all_cheapest": [10.0, 20.0]}},
                "status": {"direct": {"all_cheapest": ["exact", "vendor_fallback"]}},
            },
        }

        distribution_type, outcomes = build_configuration_outcomes(
            boosters, sheet_data, ["direct"], ["all_cheapest"]
        )

        self.assertEqual(distribution_type, "discrete_enumerated_mixed")
        self.assertEqual(
            outcomes["direct"]["all_cheapest"],
            [
                {
                    "configurationIndex": 0,
                    "label": "theme + rare #1",
                    "sheetNames": ["theme", "rare"],
                    "fixedSheetNames": ["theme"],
                    "variableSheetName": "rare",
                    "variableCardIndex": 0,
                    "variableCardUuid": "rare-a",
                    "weight": 1.0,
                    "probability": 0.75,
                    "ev": 13.0,
                    "complete": True,
                    "statusCounts": {"exact": 3},
                },
                {
                    "configurationIndex": 0,
                    "label": "theme + rare #2",
                    "sheetNames": ["theme", "rare"],
                    "fixedSheetNames": ["theme"],
                    "variableSheetName": "rare",
                    "variableCardIndex": 1,
                    "variableCardUuid": "rare-b",
                    "weight": 1.0,
                    "probability": 0.25,
                    "ev": 23.0,
                    "complete": True,
                    "statusCounts": {"exact": 2, "vendor_fallback": 1},
                },
            ],
        )

    def test_multi_variable_pick_keeps_sampled_distribution_type(self):
        boosters = [{"weight": 1, "contents": {"theme": 1, "rare": 2}}]
        sheet_data = {
            "theme": {"fixed": True},
            "rare": {"fixed": False},
        }

        distribution_type, outcomes = build_configuration_outcomes(
            boosters, sheet_data, ["direct"], ["all_cheapest"]
        )

        self.assertEqual(distribution_type, "continuous_sampled")
        self.assertEqual(outcomes, {"direct": {"all_cheapest": []}})

    def test_discrete_profit_metrics_use_probability_mass(self):
        outcomes = [
            {"ev": 5.0, "probability": 0.25, "complete": True},
            {"ev": 10.0, "probability": 0.50, "complete": True},
            {"ev": 20.0, "probability": 0.25, "complete": True},
        ]

        breakeven, score = calculate_discrete_profit_metrics(outcomes, 10.0)

        self.assertEqual(score, 75)
        self.assertEqual(breakeven, 26)


if __name__ == "__main__":
    unittest.main()