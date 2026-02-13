from __future__ import annotations

from typing import Final

import anyio
from cyclopts import App
from jinja2 import Environment, PackageLoader

app = App()

INIT_DEPENDENCIES: Final[tuple[str, ...]] = (
    "attrs",
    "datasets",
    "pydantic",
)
BENCHMARK_TEMPLATE_FILE: Final = "benchmark.py.j2"
AGENTS_TEMPLATE_FILE: Final = "benchmark_agents.md.j2"
_env: Final = Environment(
    loader=PackageLoader("oa_evals.cli", "templates"),
    autoescape=False,
    keep_trailing_newline=True,
)
_benchmark_template: Final = _env.get_template(BENCHMARK_TEMPLATE_FILE)
_agents_template: Final = _env.get_template(AGENTS_TEMPLATE_FILE)


async def _run_uv(cwd: anyio.Path, *args: str) -> None:
    result = await anyio.run_process(["uv", *args], cwd=str(cwd), check=False)
    if result.returncode != 0:
        cmd = " ".join(["uv", *args])
        raise SystemExit(f"Failed to run '{cmd}' in {cwd}.")


async def _append_agents_guide(path: anyio.Path) -> None:
    guide = _agents_template.render().strip()

    if not await path.exists():
        await path.write_text(f"# AGENTS.md\n\n{guide}\n", encoding="utf-8")
        return

    content = await path.read_text(encoding="utf-8")
    if guide in content:
        return

    separator = "" if content.endswith("\n") else "\n"
    await path.write_text(f"{content}{separator}\n{guide}\n", encoding="utf-8")


async def _write_benchmark(path: anyio.Path) -> None:
    if await path.exists():
        return

    await path.write_text(_benchmark_template.render(), encoding="utf-8")


@app.command
async def init() -> None:
    """Initialize the open-agent-evals environment."""

    cwd = await anyio.Path.cwd()
    if not await (cwd / "pyproject.toml").exists():
        await _run_uv(cwd, "init", "--bare")

    await _run_uv(cwd, "add", *INIT_DEPENDENCIES)
    await _write_benchmark(cwd / "benchmark.py")
    await _append_agents_guide(cwd / "AGENTS.md")


# Agent subcommands
agent_app = App(name="agent", help="Agent related commands.")
app.command(agent_app)
