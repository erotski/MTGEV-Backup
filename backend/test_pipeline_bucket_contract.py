import unittest

from ev_statistics import empirical_quantiles


class PipelineBucketContractTests(unittest.TestCase):
    def test_5000_rounded_samples_use_one_percent_bucket_means(self):
        # Mirrors the producer: each simulated pack total is rounded to cents
        # before the sorted samples are reduced to 100 curve buckets.
        samples = [round(index * 0.0137, 2) for index in range(1, 5001)]
        buckets = empirical_quantiles(samples)

        self.assertEqual(len(buckets), 100)
        for bucket in (21, 32, 36, 49, 58, 67, 89):
            start = (bucket - 1) * 50
            expected = round(sum(samples[start:start + 50]) / 50, 2)
            self.assertEqual(buckets[bucket - 1], expected)


if __name__ == '__main__':
    unittest.main()