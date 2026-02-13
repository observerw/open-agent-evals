from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from attrs import frozen

if TYPE_CHECKING:
    from oa_evals.acp import Trajectory
    from oa_evals.sandbox import Sandbox
    from oa_evals.task import Task


@frozen
class GraderContext:
    task: Task
    trajectory: Trajectory
    sandbox: Sandbox


class GraderProtocol(Protocol):
    async def __call__(self, ctx: GraderContext) -> object:
        """
        Evaluate the agent's performance and return an outcome.

        Implement this method to define custom grading logic. Use:
            - `ctx.task` to access the task metadata and prompt
            - `ctx.trajectory` to access the agent's trajectory
            - `ctx.sandbox` to execute commands and access files in the sandbox

        Returns:
            Any grading result value. The harness will wrap non-OutcomeData values
            into OutcomeValue automatically.

        Raises:
            Any exceptions raised during environment inspection or outcome construction.
        """
        ...
