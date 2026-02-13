from __future__ import annotations

from abc import ABC

from pydantic import BaseModel, RootModel

from oa_evals.acp import TrajectoryData
from oa_evals.grader import OutcomeData


class MetricData(BaseModel, ABC):
    """Base class for all metric output data."""


class MetricValue(MetricData, RootModel):
    """A metric value wrapping a single value."""

    @classmethod
    def ensure(cls, value: object) -> MetricData:
        match value:
            case MetricData():
                return value
            case _:
                return cls(root=value)


class TrailData[O: OutcomeData](BaseModel):
    outcomes: list[O]
    traj: TrajectoryData


class TrailsData[O: OutcomeData](RootModel[list[TrailData[O]]]):
    root: list[TrailData[O]]
