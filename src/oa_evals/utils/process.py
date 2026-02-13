from __future__ import annotations

from collections.abc import Mapping
from datetime import timedelta
from typing import NamedTuple, TypedDict

import anyio


class ProcessArgs(TypedDict):
    command: str
    args: list[str]
    cwd: str | None
    env: Mapping[str, str]


class ProcessResult(NamedTuple):
    returncode: int
    stdout: str
    stderr: str


async def run_process(
    *command: str,
    input: str | None = None,
    check: bool = True,
    encoding: str = "utf-8",
    timeout: timedelta | None = None,
) -> ProcessResult:
    """Runs a process and returns its result including stdout and stderr."""
    if timeout is not None:
        with anyio.fail_after(timeout.total_seconds()):
            result = await anyio.run_process(
                list(command),
                input=input.encode(encoding) if input else None,
                check=check,
            )
    else:
        result = await anyio.run_process(
            list(command),
            input=input.encode(encoding) if input else None,
            check=check,
        )

    return ProcessResult(
        returncode=result.returncode,
        stdout=result.stdout.decode(encoding),
        stderr=result.stderr.decode(encoding),
    )
