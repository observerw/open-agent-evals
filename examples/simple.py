from __future__ import annotations

from pathlib import Path
from typing import ClassVar, override

import anyio
from acp_agent import ACPAgent
from attrs import define
from loguru import logger

from oa_evals import Harness, prompt
from oa_evals.acp import Trajectory
from oa_evals.grader import GraderContext
from oa_evals.metric import Trails
from oa_evals.task import Benchmark, BenchmarkMetadata, Task, TaskMetadata


@define
class SimpleBenchmark(Benchmark):
    metadata: ClassVar = BenchmarkMetadata(
        id="simple-task",
        name="Simple Task",
        description="A simple test task.",
        version="0.1.0",
    )

    @override
    def load_tasks(self) -> list[Task]:
        return [
            Task(
                benchmark=self,
                metadata=TaskMetadata(
                    id="simple-instance-1",
                    name="Simple Instance 1",
                    description="A simple test instance.",
                ),
                root_path=Path.cwd(),
                prompt=prompt.text("This is a simple prompt."),
            )
        ]


async def simple_grader(ctx: GraderContext) -> int:
    return 42


async def simple_outcome_metric(simple: Trails[int], **kwargs: Trails) -> int:
    return sum(trail.outcome for trail in simple)


async def simple_traj_metric(traj: Trajectory) -> int:
    return len(traj.messages)


async def main() -> None:
    harness = Harness(
        agent=await ACPAgent.create("dummy"),
        benchmark=SimpleBenchmark(),
    )
    harness.register_graders(
        simple=simple_grader,
    )
    harness.register_trajectory_metrics(
        simple=simple_traj_metric,
    )
    harness.register_outcome_metrics(
        simple=simple_outcome_metric,  # ty: ignore[invalid-argument-type]
    )

    results = await harness.run()
    print(results)


if __name__ == "__main__":
    logger.enable("oa_evals")
    anyio.run(main)
