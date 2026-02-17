# (WIP) Open Agent Evals

A robust and extensible evaluation framework for AI agents, designed to test agentic capabilities in standardized environments.

---

## 🚀 Getting Started

### Installation

Ensure you have `uv` installed, then run:

```bash
uv sync
```

### Usage

The framework provides the `oae` (Open Agent Evals) CLI:

```bash
# List available benchmarks
uv run oae benchmark list

# Run an evaluation
uv run oae run --agent <agent_name> --benchmark <benchmark_name>
```

---

## 📖 Key Design Principles

1. **Protocol-First:** By relying on ACP, the framework remains decoupled from specific agent implementations.
2. **Environment Agnostic:** Sandboxes can be local or remote, allowing for flexible evaluation scales.
3. **Extensibility:** New metrics, graders, and benchmarks can be added by implementing the respective base classes/protocols.
4. **Concurrency:** Built from the ground up with `anyio` to support running large-scale evaluations efficiently.

## 🏗 Project Architecture

The project is structured as a Python-based evaluation platform that orchestrates the interaction between **Benchmarked Tasks**, **AI Agents**, and **Execution Sandboxes**.

### Core Components (`src/oa_evals/`)

- **`harness` (Orchestration):** The engine that coordinates the evaluation process. It manages concurrency, executes multiple "trails" (runs) for each task, and aggregates results.
- **`acp` (Agent Client Protocol):** A standardized communication layer based on the Agent Client Protocol. It allows the framework to talk to any agent that implements this protocol, regardless of its underlying model or architecture.
- **`sandbox` (Isolation):** Provides secure and isolated environments for agents to run. Supported backends include local containers (Docker), Daytona, and E2B.
- **`task` & `benchmark`:**
  - **Task:** Represents a single evaluation unit (e.g., a coding problem or a retrieval task).
  - **Benchmark:** A collection of tasks used for comprehensive evaluation.
- **`grader` & `metric`:**
  - **Grader:** Evaluates whether an agent's output is correct based on task-specific criteria.
  - **Metric:** Aggregates grading results into higher-level statistics (e.g., `pass@k`, latency).
- **`reporter`:** Handles the output and visualization of evaluation results, including a Terminal User Interface (TUI) and a web-based dashboard.

### Workspace Packages (`packages/`)

- **`acp-agent`:** A standalone package providing a reference implementation or helper tools for building ACP-compatible agents.

---

## 🛠 Technology Stack

- **Runtime:** Python 3.12+
- **Package Management:** [uv](https://github.com/astral-sh/uv) (supports workspace and fast dependency resolution).
- **Asynchronous I/O:** [anyio](https://github.com/agronholm/anyio) and [httpx](https://github.com/encode/httpx) for high-performance, concurrent evaluation runs.
- **Data Modeling:** [pydantic](https://github.com/pydantic/pydantic) and [attrs](https://github.com/python-attrs/attrs) for strict schema validation and structured data.
- **CLI Framework:** [cyclopts](https://github.com/BrianPugh/cyclopts) for a powerful and intuitive command-line interface.
- **UI & Logging:** [rich](https://github.com/Textualize/rich) for beautiful terminal output and [loguru](https://github.com/Delgan/loguru) for structured logging.
