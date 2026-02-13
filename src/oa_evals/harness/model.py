from __future__ import annotations

from pydantic import BaseModel, Field

from oa_evals.metric import MetricData
from oa_evals.task import TaskMetadata
from oa_evals.task.model import TrailResult


class OutcomeMetricResult(BaseModel):
    metrics: dict[str, MetricData] = Field(default_factory=dict)

    def add(self, metric_id: str, data: MetricData) -> None:
        self.metrics[metric_id] = data

    def get(self, metric_id: str) -> MetricData | None:
        return self.metrics.get(metric_id)

    @property
    def ids(self) -> list[str]:
        return list(self.metrics.keys())


class TaskResult(BaseModel):
    task: TaskMetadata
    trails: list[TrailResult]
    metrics: OutcomeMetricResult


class HarnessResult(BaseModel):
    agent_id: str
    tasks: list[TaskResult]
