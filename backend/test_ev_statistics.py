import unittest

from ev_statistics import empirical_quantiles


class EmpiricalQuantilesTests(unittest.TestCase):
    def test_buckets_use_sample_values_not_summary_statistics(self):
        samples = list(range(1, 501))

        buckets = empirical_quantiles(samples)

        self.assertEqual(len(buckets), 100)
        self.assertEqual(buckets[0], 3.0)
        self.assertEqual(buckets[20], 103.0)
        self.assertEqual(buckets[31], 158.0)
        self.assertEqual(buckets[35], 178.0)
        self.assertEqual(buckets[48], 243.0)
        self.assertEqual(buckets[57], 288.0)
        self.assertEqual(buckets[66], 333.0)
        self.assertEqual(buckets[88], 443.0)
        self.assertEqual(buckets[49], 248.0)
        self.assertEqual(buckets[-1], 498.0)

    def test_empty_samples_have_no_buckets(self):
        self.assertEqual(empirical_quantiles([]), [])


if __name__ == "__main__":
    unittest.main()