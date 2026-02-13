from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING

from attr import frozen

from oa_evals.acp import Trajectory

if TYPE_CHECKING:
    from .abc import OutcomeMetricProtocol, TrajectoryMetricProtocol


@frozen
class Trail[O]:
    """Represents the outcome from a single grader for a single trail.

    Attributes:
        traj: The trajectory of the evaluation attempt.
    """

    outcome: O
    traj: Trajectory


type Trails[O] = Sequence[Trail[O]]
"""A collection of trails, representing multiple attempts for the same task."""

type TrajectoryMetricRegistry = dict[str, TrajectoryMetricProtocol]
type OutcomeMetricRegistry = dict[str, OutcomeMetricProtocol]
