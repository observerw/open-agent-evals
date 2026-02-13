from __future__ import annotations


class GraderError(Exception):
    """Base exception for the grader module."""


class GradingError(GraderError):
    """Raised when grading fails."""
