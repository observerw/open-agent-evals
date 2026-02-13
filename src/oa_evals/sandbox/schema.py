from __future__ import annotations

from collections.abc import Mapping

from attrs import frozen

type BuildArgs = Mapping[str, str]


@frozen
class CommandResult:
    """Command execution result."""

    exit_code: int | None
    output: str
    signal: str | None = None
    truncated: bool = False
