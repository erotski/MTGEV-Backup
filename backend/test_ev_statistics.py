import unittest

from ev_statistics import empirical_quantiles


class EmpiricalQuantilesTests(unittest.TestCase):
    def test_buckets_use_sample_values_not_summary_statistics(self):
        samples = list(range(1, 501))

        buckets = empirical_quantiles(samples)

        self.assertEqual(len(buckets), 100)
        self.assertEqual(buckets[0], 5.0)
        self.assertEqual(buckets[49], 250.0)
        self.assertEqual(buckets[-1], 500.0)

    def test_empty_samples_have_no_buckets(self):
        self.assertEqual(empirical_quantiles([]), [])


if __name__ == "__main__":
    unittest.main()