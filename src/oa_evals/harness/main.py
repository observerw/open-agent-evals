from __future__ import annotations

from functools import partial
from itertools import product

import anyio
from acp_agent import ACPAgent
from attrs import define, field
from loguru import logger

from oa_evals.acp import TrajectoryBuilder
from oa_evals.grader import GraderProtocol, GraderRegistry
from oa_evals.metric import (
    MetricValue,
    OutcomeMetricProtocol,
    OutcomeMetricRegistry,
    TrajectoryMetricProtocol,
    TrajectoryMetricRegistry,
)
from oa_evals.metric import Trail as MetricTrail
from oa_evals.sandbox import SandboxBuilder
from oa_evals.sandbox.container import ContainerSandboxBuilder
from oa_evals.task.abc import Benchmark, Task
from oa_evals.task.abc import Trail as TaskTrail
from oa_evals.task.model import TrailResult
from oa_evals.task.runner import TrailRunner
from oa_evals.utils.sync import with_sem

from .model import HarnessResult, OutcomeMetricResult, TaskResult


@define
class Harness:
    """Evaluation harness for running tasks end-to-end with concurrency and grading."""

    agent: ACPAgent
    benchmark: Benchmark

    sandbox: SandboxBuilder = field(factory=ContainerSandboxBuilder)
    """Sandbox builder for creating isolated environments for each trail. Defaults to ContainerSandboxBuilder. """

    trail_count: int = 1
    """Number of trails to run for each task. """

    concurrency: int = 1
    """
    Number of task trails to run concurrently.

    Higher concurrency can speed up evaluation but may lead to API rate limit.
    """

    concurrent_grade: bool = False
    """
    Whether to grade trails concurrently. Defaults to False.

    Needs to be set to False when graders have dependency on each other (e.g. one grader checks if the code compiles, and another one checks if the code runs correctly).

    If all graders are independent, setting this to True can speed up the grading process.
    """

    _grader_registry: GraderRegistry = field(init=False, factory=dict)
    _outcome_metric_registry: OutcomeMetricRegistry = field(init=False, factory=dict)
    _traj_metric_registry: TrajectoryMetricRegistry = field(init=False, factory=dict)

    _results: dict[str, list[TrailResult]] = field(init=False, factory=dict)
    _trail_sem: anyio.Semaphore = field(init=False)

    def __attrs_post_init__(self) -> None:
        self._trail_sem = anyio.Semaphore(self.concurrency)

        # auto register graders and metrics from benchmark
        self._grader_registry.update(self.benchmark.graders)
        self._outcome_metric_registry.update(self.benchmark.outcome_metrics)
        self._traj_metric_registry.update(self.benchmark.trajectory_metrics)

    def register_graders(self, **graders: GraderProtocol) -> None:
        """
        Register graders for evaluating task outcomes.

        The argument name will be used as the grader ID for metric calculation. For example:

            ```python
            harness.register_graders(some_grader=SomeGrader())

            def some_metric(some_grader: Trails[SomeOutcome]) -> MetricValue: ...
            ```

        The grader's execution order will be determined by the order of registration.

        """
        self._grader_registry.update(graders)

    def register_trajectory_metrics(self, **metrics: TrajectoryMetricProtocol) -> None:
        self._traj_metric_registry.update(metrics)

    def register_outcome_metrics(self, **metrics: OutcomeMetricProtocol) -> None:
        self._outcome_metric_registry.update(metrics)

    async def run(self) -> HarnessResult:
        """Run all tasks and trails with global concurrency control."""
        tasks = self.benchmark.load_tasks()

        async with anyio.create_task_group() as tg:
            for task, trail_idx in product(tasks, range(self.trail_count)):
                tg.start_soon(
                    with_sem(self._trail_sem, self._run_trail, task, trail_idx)
                )

        self._log_completion_status(tasks)
        return await self._build_harness_result(tasks)

    async def _run_trail(self, task: Task, trail_idx: int) -> None:
        """Execute a single trail and store its result."""

        runner = TrailRunner(
            agent=self.agent,
            sandbox_builder=self.sandbox,
            concurrent_grade=self.concurrent_grade,
            trail=TaskTrail(idx=trail_idx, task=task),
            graders=self._grader_registry,
        )

        result = await runner.run()

        task_id = task.metadata.id
        self._results.setdefault(task_id, []).append(result)

        logger.info(
            "Trail {}/{} completed for task {}",
            trail_idx + 1,
            self.trail_count,
            task_id,
        )

    async def _build_task_result(self, task: Task) -> TaskResult:
        """Build result for a single task from all its trails."""
        results = self._results.get(task.metadata.id, [])

        # Build trails grouped by grader for metric calculation
        grader_trails: dict[str, list[MetricTrail]] = {}
        for result in results:
            # Rebuild trajectory from trajectory data
            trajectory = TrajectoryBuilder.build_from(result.traj.updates)

            # Group by grader
            for grader_id, outcome in result.outcomes.items():
                if isinstance(outcome, MetricValue):
                    outcome = outcome.root  # unwrap value
                trail = MetricTrail(outcome=outcome, traj=trajectory)
                grader_trails.setdefault(grader_id, []).append(trail)

        # Calculate outcome metrics
        outcome_metrics = OutcomeMetricResult()

        async def calculate_metric(
            metric_id: str, metric: OutcomeMetricProtocol
        ) -> None:
            raw = await metric(**grader_trails)
            value = MetricValue.ensure(raw)
            outcome_metrics.add(metric_id, value)

        async with anyio.create_task_group() as tg:
            for metric_id, metric in self._outcome_metric_registry.items():
                tg.start_soon(partial(calculate_metric, metric_id, metric))

        return TaskResult(
            task=task.metadata,
            trails=results,
            metrics=outcome_metrics,
        )

    async def _build_harness_result(self, tasks: list[Task]) -> HarnessResult:
        """Build final harness result from all tasks."""
        results: dict[str, TaskResult] = {}

        async def build_result(task: Task) -> None:
            result = await self._build_task_result(task)
            results[task.metadata.id] = result

        async with anyio.create_task_group() as tg:
            for task in tasks:
                tg.start_soon(build_result, task)

        task_results = [results[task.metadata.id] for task in tasks]
        return HarnessResult(agent_id=self.agent.agent_id, tasks=task_results)

    def _log_completion_status(self, tasks: list[Task]) -> None:
        """Log completion status for all tasks."""
        for task in tasks:
            results = self._results.get(task.metadata.id, [])
            logger.info(
                "Task {} completed: {}/{} trails succeeded",
                task.metadata.id,
                len(results),
                self.trail_count,
            )
