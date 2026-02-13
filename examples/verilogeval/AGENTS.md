# VerilogEval Module

This module contains the benchmark and metric definitions for Verilog evaluation.

## Benchmark

The `VerilogEvalBenchmark` class is responsible for loading tasks from the `dakies/nvlabs-verilogeval` dataset.

When implementing or modifying:
- Ensure `VerilogEvalRow` correctly validates the dataset schema.
- `load_tasks` should yield `Task` objects with appropriate prompts and setup functions.

## Metrics and Graders

- `compile_grader`: Use `iverilog` to compile `solution.v` and `tb.v`. Return success if exit code is 0.
- `sim_grader`: Use `vvp` to run the compiled `sim` executable. Check for "Mismatches: 0" in the output.
- `create_pass_k`: Implement the pass@k formula using `math.comb`.
