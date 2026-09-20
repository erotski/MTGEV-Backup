import unittest

from export_product_metrics import build_product_metrics
from validate_frontend_snapshot import validate


class FrontendSnapshotContractTests(unittest.TestCase):
    def test_metric_export_rejects_duplicate_identity(self):
        products = [
            {
                "id": "duplicate-product",
                "marketPrice": 10,
                "metricsByVendor": {
                    "cardkingdom": {
                        "mean": 5, "median": 5, "min": 1, "p05": 2, "p95": 8, "max": 10,
                    },
                },
            },
            {
                "id": "duplicate-product",
                "marketPrice": 20,
                "metricsByVendor": {
                    "cardkingdom": {
                        "mean": 6, "median": 6, "min": 1, "p05": 2, "p95": 9, "max": 12,
                    },
                },
            },
        ]

        with self.assertRaisesRegex(ValueError, "Duplicate product metric identity"):
            build_product_metrics(products)

    def test_published_snapshot_contract(self):
        summary = validate()
        self.assertGreater(summary["products"], 0)
        self.assertGreater(summary["metrics"], 0)
        self.assertGreater(summary["boosters"], 0)
        self.assertEqual(summary["products"], summary["chaseProducts"])


if __name__ == "__main__":
    unittest.main()
