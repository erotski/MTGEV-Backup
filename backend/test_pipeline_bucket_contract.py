import unittest

from ev_statistics import empirical_quantiles


class PipelineBucketContractTests(unittest.TestCase):
    def test_5000_rounded_samples_preserve_endpoints_and_98_interior_means(self):
        # Mirrors the producer: each simulated pack total is rounded to cents
        # before the sorted samples are reduced to the 100-point curve.
        samples = [round(index * 0.0137, 2) for index in range(1, 5001)]
        buckets = empirical_quantiles(samples)

        self.assertEqual(len(buckets), 100)
        self.assertEqual(buckets[0], samples[0])
        self.assertEqual(buckets[-1], samples[-1])
        interior = samples[1:-1]
        for point in (2, 50, 99):
            bucket = point - 2
            start = bucket * len(interior) // 98
            end = (bucket + 1) * len(interior) // 98
            expected = round(sum(interior[start:end]) / (end - start), 2)
            self.assertEqual(buckets[point - 1], expected)


if __name__ == '__main__':
    unittest.main()