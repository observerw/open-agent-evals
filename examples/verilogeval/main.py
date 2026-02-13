from __future__ import annotations

import anyio
from acp_agent import ACPAgent
from verilogeval.benchmark import (
    VerilogEvalBenchmark,
    compile_grader,
    create_pass_k,
    sim_grader,
)

from oa_evals import Harness


async def main() -> None:
    # 1. Setup agent
    agent = await ACPAgent.create("opencode")

    # 2. Setup benchmark
    benchmark = VerilogEvalBenchmark()

    # 3. Setup harness
    harness = Harness(
        benchmark=benchmark,
        agent=agent,
    )
    harness.register_graders(
        compilation=compile_grader,
        simulation=sim_grader,
    )
    harness.register_outcome_metrics(
        pass_at_1=create_pass_k(k=1),
        pass_at_2=create_pass_k(k=2),
        pass_at_3=create_pass_k(k=3),
        pass_at_5=create_pass_k(k=5),
        pass_at_10=create_pass_k(k=10),
    )

    # 4. Run evaluation
    results = await harness.run()
    print(results)


if __name__ == "__main__":
    anyio.run(main)
