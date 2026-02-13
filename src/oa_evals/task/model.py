from __future__ import annotations

from pydantic import BaseModel

from oa_evals.acp import TrajectoryData
from oa_evals.grader import OutcomeData


class TaskMetadata(BaseModel):
    id: str
    name: str
    description: str | None = None


class BenchmarkMetadata(BaseModel):
    id: str
    name: str
    description: str
    version: str


class TrailResult(BaseModel):
    traj: TrajectoryData
    outcomes: dict[str, OutcomeData]
