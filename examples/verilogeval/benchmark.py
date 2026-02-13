from __future__ import annotations

import math
from functools import partial
from pathlib import Path
from typing import ClassVar, override

import attrs
from datasets import Dataset, load_dataset
from pydantic import BaseModel, Field

from oa_evals import prompt
from oa_evals.grader import GraderContext, GraderRegistry, OutcomeValue
from oa_evals.metric import MetricValue, OutcomeMetricProtocol, Trails
from oa_evals.sandbox import Sandbox
from oa_evals.task import Benchmark, BenchmarkMetadata, Task, TaskMetadata


async def compile_grader(ctx: GraderContext) -> OutcomeValue[bool]:
    """
    Grades if the Verilog code compiles successfully.
    """
    solution_path = Path("solution.v")
    if not await ctx.sandbox.exists(solution_path):
        return OutcomeValue(root=False)

    compile_result = await ctx.sandbox.terminal(
        "iverilog", "-o", "sim", str(solution_path), "tb.v"
    ).wait()
    return OutcomeValue(root=compile_result.exit_code == 0)


async def sim_grader(ctx: GraderContext) -> OutcomeValue[bool]:
    """
    Grades if the Verilog simulation passes.
    """
    # 1. Check if sim executable exists (produced by compile_grader)
    if not await ctx.sandbox.exists(Path("sim")):
        return OutcomeValue(root=False)

    # 2. Run simulation with vvp
    run_result = await ctx.sandbox.terminal("vvp", "sim").wait()
    if run_result.exit_code != 0:
        return OutcomeValue(root=False)

    # 3. Parse output for "Mismatches: 0"
    return OutcomeValue(root="Mismatches: 0" in run_result.output)


def create_pass_k(k: int) -> OutcomeMetricProtocol:
    async def pass_k(
        *, simulation: Trails[OutcomeValue[bool]], **kwargs: Trails
    ) -> MetricValue[float]:
        """Calculates pass@k metric for verilog evaluation."""
        n = len(simulation)
        if n == 0:
            return MetricValue(root=0.0)

        c = sum(1 for trail in simulation if trail.outcome.root)
        if n - c < k:
            return MetricValue(root=1.0)

        val = 1.0 - math.comb(n - c, k) / math.comb(n, k)
        return MetricValue(root=val)

    return pass_k  # type: ignore[return-value]


class VerilogEvalRow(BaseModel):
    task_id: str
    prompt: str
    test: str
    canonical_solution: str | None = None
    detail_description: str | None = Field(default=None)


@attrs.define
class VerilogEvalBenchmark(Benchmark):
    metadata: ClassVar = BenchmarkMetadata(
        id="verilog-eval",
        name="VerilogEval",
        description="Verilog evaluation benchmark using nvlabs-verilogeval dataset",
        version="0.1.0",
    )
    containerfile: ClassVar = "FROM hdlc/iverilog:latest"
    graders: ClassVar = GraderRegistry(
        compile=compile_grader,
        simulation=sim_grader,
    )

    @override
    def load_tasks(self) -> list[Task]:
        async def copy_tb(sandbox: Sandbox, testbench: str) -> None:
            await sandbox.write_file(Path("tb.v"), testbench)

        dataset = load_dataset("dakies/nvlabs-verilogeval", split="test")
        assert isinstance(dataset, Dataset)

        tasks: list[Task] = []
        for row_data in dataset:
            row = VerilogEvalRow.model_validate(row_data)
            tasks.append(
                Task(
                    benchmark=self,
                    metadata=TaskMetadata(
                        id=row.task_id,
                        name=row.task_id,
                        description=row.detail_description,
                    ),
                    root_path=Path.cwd(),
                    prompt=prompt.text(
                        f"Please implement the following Verilog module and write the code to 'solution.v' in the current directory.\n\n"
                        f"Description:\n{row.detail_description or ''}\n\n"
                        f"Module Header:\n{row.prompt}"
                    ),
                    setup=partial(copy_tb, testbench=row.test),
                )
            )
        return tasks
