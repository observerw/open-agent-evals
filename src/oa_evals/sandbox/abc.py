from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator, Mapping
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Self

from acp import Client
from acp.client import ClientSideConnection
from attrs import define, field

from .schema import BuildArgs, CommandResult


@define
class Terminal(ABC):
    @abstractmethod
    async def wait(self) -> CommandResult:
        """Wait for the terminal to finish and return result."""

    @abstractmethod
    async def kill(self) -> None:
        """Kill the terminal process."""

    async def stream(self) -> AsyncGenerator[str]:
        """Asynchronously yield output chunks from the terminal."""
        result = await self.wait()
        yield result.output


@define
class Terminals[T: Terminal]:
    _registry: dict[str, T] = field(factory=dict)

    def register(self, terminal_id: str, terminal: T) -> None:
        self._registry[terminal_id] = terminal

    async def release(self, terminal_id: str) -> None:
        if terminal := self._registry.pop(terminal_id, None):
            await terminal.kill()


class Sandbox(ABC):
    @abstractmethod
    async def read_file(
        self, path: Path, *, limit: int | None = None, line: int | None = None
    ) -> str:
        """Read file content."""

    @abstractmethod
    async def write_file(self, path: Path, content: str) -> None:
        """Write file content."""

    @abstractmethod
    async def upload_file(self, local_path: Path, container_path: Path) -> None:
        """Upload file/directory from host to sandbox."""

    @abstractmethod
    async def download_file(self, remote_path: Path, container_path: Path) -> None:
        """Download file/directory from sandbox to host."""

    @abstractmethod
    async def exists(self, path: Path) -> bool:
        """Check if file exists."""

    @abstractmethod
    def terminal(
        self,
        *cmd: str,
        cwd: str | Path | None = None,
        env: Mapping[str, str] | None = None,
        timeout: float | None = None,
    ) -> Terminal: ...

    @abstractmethod
    async def acp(
        self,
        client: Client,
        *cmd: str,
        cwd: str | Path | None = None,
        env: Mapping[str, str] | None = None,
    ) -> ClientSideConnection:
        """Run acp agent command in the sandbox and return a client-side connection."""

    @asynccontextmanager
    async def run(self) -> AsyncGenerator[Self]:
        """Run the sandbox environment."""
        yield self


class SandboxBuilder(ABC):
    @abstractmethod
    async def build(
        self,
        containerfile: str,
        *,
        tag: str | None = None,
        build_args: BuildArgs | None = None,
        context: str | Path | None = None,
    ) -> Sandbox:
        """Build the sandbox environment."""
