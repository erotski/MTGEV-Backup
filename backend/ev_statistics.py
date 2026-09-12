"""Shared empirical-distribution helpers for EV calculations."""

from typing import Iterable, List


def empirical_quantiles(samples: Iterable[float], bucket_count: int = 100) -> List[float]:
    """Return percentile buckets directly from sorted empirical samples."""
    values = sorted(float(value) for value in samples)
    if not values or bucket_count <= 0:
        return []

    sample_count = len(values)
    buckets = []
    for bucket in range(1, bucket_count + 1):
        index = min(sample_count - 1, max(0, int((bucket / bucket_count) * sample_count) - 1))
        buckets.append(round(values[index], 2))
    return buckets