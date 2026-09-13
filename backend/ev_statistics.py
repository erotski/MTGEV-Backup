"""Shared empirical-distribution helpers for EV calculations."""

from typing import Iterable, List


def empirical_quantiles(samples: Iterable[float], bucket_count: int = 100) -> List[float]:
    """Return the mean of each equal-width empirical percentile bucket.

    With 5,000 samples and 100 buckets, each output point is the average of
    50 adjacent sorted samples. This is intentionally different from taking
    one percentile-rank sample and preserves the user's 1%-increment curve
    definition.
    """
    values = sorted(float(value) for value in samples)
    if not values or bucket_count <= 0:
        return []

    sample_count = len(values)
    buckets = []
    for bucket in range(1, bucket_count + 1):
        start = (bucket - 1) * sample_count // bucket_count
        end = bucket * sample_count // bucket_count
        bucket_values = values[start:max(start + 1, end)]
        buckets.append(round(sum(bucket_values) / len(bucket_values), 2))
    return buckets