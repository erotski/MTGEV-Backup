import unittest

from ev_statistics import empirical_quantiles


class EmpiricalQuantilesTests(unittest.TestCase):
    def test_curve_preserves_exact_endpoints_and_98_interior_means(self):
        samples = list(range(1, 501))

        buckets = empirical_quantiles(samples)

        self.assertEqual(len(buckets), 100)
        self.assertEqual(buckets[0], 1.0)
        self.assertEqual(buckets[-1], 500.0)
        interior = samples[1:-1]
        for point in (2, 51, 99):
            bucket = point - 2
            start = bucket * len(interior) // 98
            end = (bucket + 1) * len(interior) // 98
            expected = round(sum(interior[start:end]) / (end - start), 2)
            self.assertEqual(buckets[point - 1], expected)

    def test_empty_samples_have_no_buckets(self):
        self.assertEqual(empirical_quantiles([]), [])


if __name__ == "__main__":
    unittest.main()