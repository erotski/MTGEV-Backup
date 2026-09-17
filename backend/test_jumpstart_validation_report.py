import unittest

from export_jumpstart_validation_report import allocate_counts, classify_set


class JumpstartValidationReportTests(unittest.TestCase):
    def test_report_classifies_mixed_pack_and_allocates_global_samples(self):
        booster = {
            "boosters": [
                {"weight": 1, "contents": {"theme": 19, "rare": 1}},
                {"weight": 1, "contents": {"themeTwo": 19, "rare": 1}},
            ],
            "sheets": {
                "theme": {"fixed": True, "cards": {"a": 19}},
                "themeTwo": {"fixed": True, "cards": {"b": 19}},
                "rare": {"fixed": False, "cards": {"r": 1, "m": 1}},
            },
        }
        override = {"fixedSheets": ["theme", "themeTwo"]}

        report = classify_set("TST", booster, override, 123, "mtgjson")

        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["metadataMode"], "exactFixedSheets")
        self.assertEqual([item["allocatedSamples"] for item in report["configurations"]], [62, 61])
        self.assertEqual(
            [item["treatment"] for item in report["configurations"][0]["contents"]],
            ["fixed", "variable"],
        )

    def test_allocation_preserves_requested_sample_count(self):
        self.assertEqual(sum(allocate_counts([1] * 121, 5000)), 5000)


if __name__ == "__main__":
    unittest.main()