from __future__ import annotations

from typing import Protocol

from oa_evals.acp import Trajectory

from .schema import Trails


class TrajectoryMetricProtocol(Protocol):
    """A metric that calculates values based on a single trajectory.

    Example:
        Calculating the number of steps in a trajectory or estimating the token cost.
    """

    async def __call__(self, traj: Trajectory) -> object: ...


class OutcomeMetricProtocol(Protocol):
    """A metric that calculates values based on multiple trails.

    Example:
        Calculating the average success rate across multiple trails.
    """

    async def __call__(self, **kwargs: Trails) -> object: ...
