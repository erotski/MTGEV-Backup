"""Shared empirical-distribution helpers for EV calculations."""

from typing import Iterable, List


def empirical_quantiles(samples: Iterable[float], bucket_count: int = 100) -> List[float]:
    """Return 100 points with exact endpoints and empirical interior means.

    The public curve contract is exactly 100 one-percent points:
    the first point is the exact minimum sample, the last point is the exact
    maximum sample, and the 98 interior points are means of equal empirical
    buckets over the samples between those endpoints. This keeps the curve's
    endpoints visible without changing its one-point-per-percentile shape.
    """
    values = sorted(float(value) for value in samples)
    if not values or bucket_count <= 0:
        return []
    if bucket_count == 1:
        return [round(values[0], 2)]
    if len(values) == 1:
        return [round(values[0], 2)] * bucket_count
    if len(values) == 2:
        return [round(values[0], 2)] + [round(values[0], 2)] * (bucket_count - 2) + [round(values[-1], 2)]

    interior_count = bucket_count - 2
    interior_values = values[1:-1]
    interior_buckets = []
    sample_count = len(interior_values)
    for bucket in range(1, interior_count + 1):
        start = (bucket - 1) * sample_count // interior_count
        end = bucket * sample_count // interior_count
        bucket_values = interior_values[start:max(start + 1, end)]
        interior_buckets.append(round(sum(bucket_values) / len(bucket_values), 2))

    return [round(values[0], 2), *interior_buckets, round(values[-1], 2)]