from __future__ import annotations

from math import comb

from oa_evals.grader import OutcomeValue
from oa_evals.metric import MetricValue, Trails


def pass_k(n: int, c: int = 1, k: int = 1) -> float:
    """Calculate the pass@k metric.

    Args:
        n (int): Total number of samples.
        c (int): Number of correct samples.
        k (int): Number of samples to consider for passing.

    Returns:
        float: The pass@k value.
    """

    if n - c < k:
        return 1.0

    return 1.0 - comb(n - c, k) / comb(n, k)


async def pass_k_metric(
    is_pass: Trails[OutcomeValue[bool]], k: int = 1, **kwargs: Trails
) -> MetricValue[float]:
    """Pass@k metric."""
    n = len(is_pass)
    c = sum(trail.outcome.root for trail in is_pass)
    return MetricValue(root=pass_k(n=n, c=c, k=k))
