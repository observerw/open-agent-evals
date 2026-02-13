from __future__ import annotations


class TaskError(Exception):
    """Base exception for the task module."""


class RunnerError(TaskError):
    """Raised when a task runner fails."""


class ImageBuildError(RunnerError):
    """Raised when a Docker image build fails."""
