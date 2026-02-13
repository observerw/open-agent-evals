from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Generator
from pathlib import Path
from typing import ClassVar, Final, Protocol, override

from acp_agent.main import ACPAgent
from attrs import define, field, frozen
from jinja2 import Environment
from jinja2.loaders import PackageLoader

from oa_evals.acp import PromptBlock, PromptGeneratorProtocol, Trajectory
from oa_evals.grader import GraderRegistry
from oa_evals.metric import OutcomeMetricRegistry, TrajectoryMetricRegistry
from oa_evals.sandbox import Sandbox

from .model import BenchmarkMetadata, TaskMetadata

env: Final = Environment(loader=PackageLoader("oa_evals.task", "templates"))
default_containerfile_template: Final = env.get_template("Containerfile.default.j2")


@frozen
class Trail:
    """
    Single trail of a task evaluation.
    """

    idx: int
    task: Task

    async def format_containerfile(self, agent: ACPAgent) -> str:
        env_containerfile = self.task.containerfile or self.task.benchmark.containerfile
        return await agent.format_containerfile(env_containerfile)


class TaskSetupProtocol(Protocol):
    async def __call__(self, sandbox: Sandbox) -> None:
        """
        Protocol for task setup function.

        This function will be called with the sandbox instance before the evaluation of a task begins.
        It can be used to perform any necessary setup or initialization within the sandbox environment.

        Args:
            sandbox: The Sandbox instance for the current task evaluation.
        """


@frozen
class Task:
    """
    Evaluation task.

    The `root_path` will be mounted to `container_workdir` inside the container during evaluation.
    If a `Containerfile` exists under `root_path`, it will be used to build the image;
    otherwise, the `default_container_file` provided by the `Task` will be used.
    """

    benchmark: Benchmark
    """Parent benchmark containing this task."""

    metadata: TaskMetadata
    """Metadata for the task."""

    root_path: Path
    """Local path for building the task's container."""

    prompt: PromptBlock | list[PromptBlock] | PromptGeneratorProtocol
    """
    Initial prompt blocks or a generator for dynamic multi-turn interactions.

    Can be a single PromptBlock, a list of blocks, or a generator that produces
    prompts dynamically based on the current trajectory.

    Recommended usage:
    >>> from oa_evals import prompt
    >>> prompt.text("content")
    """

    containerfile: str | None = None
    """Content of the Containerfile used to build the image for this task."""

    container_workdir: Path = Path("/workspace")
    """Working directory inside the container."""

    container_env: dict[str, str] = field(factory=dict)
    """Environment variables for the sandbox container."""

    setup: TaskSetupProtocol | None = None
    """Setup function to be called with the sandbox instance before evaluation."""

    async def invoke_prompt(self, traj: Trajectory) -> list[PromptBlock] | None:
        if callable(self.prompt):
            return await self.prompt(traj)

        initial = len(traj.groups) == 0

        if isinstance(self.prompt, list):
            return self.prompt if initial else None  # ty: ignore[invalid-return-type]

        return [self.prompt] if initial else None  # ty: ignore[invalid-return-type]


@define
class Benchmark(ABC):
    """
    Abstract base class for evaluation tasks.
    """

    metadata: ClassVar[BenchmarkMetadata]

    outcome_metrics: ClassVar[OutcomeMetricRegistry] = field(factory=dict)
    """Benchmark-provided outcome metrics, keyed by metric id."""

    trajectory_metrics: ClassVar[TrajectoryMetricRegistry] = field(factory=dict)
    """Benchmark-provided trajectory metrics, keyed by metric id."""

    graders: ClassVar[GraderRegistry] = field(factory=dict)
    """Benchmark-provided graders, keyed by grader id."""

    containerfile: ClassVar[str] = field(
        factory=lambda: default_containerfile_template.render()
    )
    """Default Containerfile content for the benchmark."""

    @abstractmethod
    def load_tasks(self) -> list[Task]:
        """
        Load and return the list of Task objects for this task.

        This method should be implemented by subclasses to provide
        specific tasks for evaluation.

        Returns:
            A list of Task objects.
        """


@define
class StreamBenchmark(Benchmark):
    """
    Benchmark that need to generate tasks dynamically as a stream.
    """

    task_count: int | None = None
    """TotTotal number of tasks to generate. None if you are not sure about it."""

    @abstractmethod
    def stream_tasks(self) -> Generator[Task]:
        """
        Asynchronously generate and yield Task objects for this benchmark.

        This method should be implemented by subclasses to provide
        specific tasks for evaluation in a streaming manner.

        Yields:
            Task objects.
        """

    @override
    def load_tasks(self) -> list[Task]:
        """
        Load tasks by consuming the stream of tasks generated by `stream_tasks`.

        Returns:
            A list of Task objects.
        """

        return list(self.stream_tasks())
