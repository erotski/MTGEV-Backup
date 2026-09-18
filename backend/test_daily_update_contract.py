import unittest

from daily_update import PUBLISHED_SNAPSHOT_FILES


class DailyUpdateContractTests(unittest.TestCase):
    def test_published_snapshot_manifest_has_unique_files(self):
        self.assertEqual(len(PUBLISHED_SNAPSHOT_FILES), len(set(PUBLISHED_SNAPSHOT_FILES)))
        self.assertIn("pricing_validator_diagnostics.json", PUBLISHED_SNAPSHOT_FILES)
        self.assertIn("latest_pipeline_run.json", PUBLISHED_SNAPSHOT_FILES)


if __name__ == "__main__":
    unittest.main()