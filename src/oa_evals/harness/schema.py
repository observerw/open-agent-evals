from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime

from attrs import define, field


@define
class FailureAttempt:
    """Records a single failed trail attempt for debugging."""

    trail_idx: int
    error: str
    timestamp: datetime = field(factory=datetime.now)


@define
class TaskFailureLog:
    """Failure log for a task."""

    task_id: str
    attempts: list[FailureAttempt] = field(factory=list)

    def add_failure(self, trail_idx: int, error: str) -> None:
        """Add failure attempt."""
        self.attempts.append(
            FailureAttempt(
                trail_idx=trail_idx,
                error=error,
            )
        )

    @property
    def total_failures(self) -> int:
        return len(self.attempts)


@define
class DebugContext:
    enabled: bool

    _failure_logs: dict[str, TaskFailureLog] = field(
        factory=dict, alias="_failure_logs", init=False
    )

    def log_failure(self, task_id: str, trail_idx: int, error: Exception) -> None:
        if not self.enabled:
            return

        if task_id not in self._failure_logs:
            self._failure_logs[task_id] = TaskFailureLog(task_id)

        self._failure_logs[task_id].add_failure(
            trail_idx=trail_idx,
            error=str(error),
        )

    def get_log(self, task_id: str) -> TaskFailureLog | None:
        return self._failure_logs.get(task_id)

    def iter_logs(self) -> Iterator[TaskFailureLog]:
        return iter(self._failure_logs.values())
