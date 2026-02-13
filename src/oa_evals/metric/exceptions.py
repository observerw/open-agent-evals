from __future__ import annotations


class MetricError(Exception):
    """Base exception for the metric module."""


class MetricCalculationError(MetricError):
    """Raised when a metric calculation fails."""
