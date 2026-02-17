from __future__ import annotations

import asyncio
import subprocess
import uuid
from collections.abc import AsyncGenerator, Mapping
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Self, final, override

import anyio
from acp import Client, connect_to_agent
from acp.client import ClientSideConnection
from anyio.abc import Process
from attrs import define, field

from ..abc import Sandbox, SandboxBuilder, Terminal
from ..exceptions import FileOperationError, TerminalOperationError
from ..schema import BuildArgs, CommandResult
from .utils import (
    build_exec_command,
    build_image,
    download_from_container,
    exec_container,
    rm_container,
    rm_image,
    start_container,
    stop_container,
    upload_to_container,
)


def _slice_content(content: str, *, limit: int | None, line: int | None) -> str:
    if line is None and limit is None:
        return content

    lines = content.splitlines(keepends=True)
    start = 0 if line is None or line <= 1 else line - 1
    if start >= len(lines):
        return ""

    if limit is None:
        return "".join(lines[start:])
    if limit <= 0:
        return ""
    return "".join(lines[start : start + limit])


@define
class ContainerTerminal(Terminal):
    args: list[str]
    timeout: float | None = None
    _process: Process | None = field(init=False, default=None)

    @override
    async def wait(self) -> CommandResult:
        async with await anyio.open_process(
            self.args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        ) as process:
            self._process = process
            output = (
                b"".join([chunk async for chunk in process.stdout])
                if process.stdout
                else b""
            )
            await process.wait()
            return CommandResult(
                exit_code=process.returncode,
                output=output.decode(),
            )

    @override
    async def kill(self) -> None:
        if self._process:
            self._process.terminate()

    @override
    async def stream(self) -> AsyncGenerator[str]:
        async with await anyio.open_process(
            self.args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        ) as process:
            self._process = process
            if process.stdout:
                async for chunk in process.stdout:
                    yield chunk.decode()


@define
class ContainerSandbox(Sandbox):
    image_tag: str
    is_temporary: bool = False
    _container_name: str = field(
        init=False, factory=lambda: f"oa-evals-{uuid.uuid4().hex[:8]}"
    )

    @override
    async def read_file(
        self, path: Path, *, limit: int | None = None, line: int | None = None
    ) -> str:
        result = await exec_container(
            self._container_name,
            "cat",
            str(path),
            check=False,
        )
        if result.returncode != 0:
            detail = result.stderr or result.stdout
            raise FileOperationError(f"Failed to read file {path}: {detail}")
        return _slice_content(result.stdout, limit=limit, line=line)

    @override
    async def write_file(self, path: Path, content: str) -> None:
        result = await exec_container(
            self._container_name,
            "tee",
            str(path),
            input=content,
            check=False,
        )
        if result.returncode != 0:
            detail = result.stderr or result.stdout
            raise FileOperationError(f"Failed to write file {path}: {detail}")

    @override
    async def upload_file(self, local_path: Path, container_path: Path) -> None:
        await upload_to_container(self._container_name, local_path, container_path)

    @override
    async def download_file(self, remote_path: Path, container_path: Path) -> None:
        await download_from_container(self._container_name, remote_path, container_path)

    @override
    async def exists(self, path: Path) -> bool:
        result = await exec_container(
            self._container_name, "test", "-e", str(path), check=False
        )
        return result.returncode == 0

    @override
    def terminal(
        self,
        *cmd: str,
        cwd: str | Path | None = None,
        env: Mapping[str, str] | None = None,
        timeout: float | None = None,
    ) -> ContainerTerminal:
        args = self._build_exec_args(*cmd, cwd=cwd, env=env)
        return ContainerTerminal(args=args, timeout=timeout)

    @override
    async def acp(
        self,
        client: Client,
        *cmd: str,
        cwd: str | Path | None = None,
        env: Mapping[str, str] | None = None,
    ) -> ClientSideConnection:
        args = self._build_exec_args(*cmd, cwd=cwd, env=env)
        process = await asyncio.create_subprocess_exec(
            *args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
        )
        if process.stdin is None or process.stdout is None:
            msg = "Failed to open ACP process streams"
            raise TerminalOperationError(msg)
        return connect_to_agent(client, process.stdin, process.stdout)

    def _build_exec_args(
        self,
        *cmd: str,
        cwd: str | Path | None = None,
        env: Mapping[str, str] | None = None,
    ) -> list[str]:
        if not cmd:
            raise TerminalOperationError("Command cannot be empty")

        command = ("sh", "-lc", cmd[0]) if len(cmd) == 1 else tuple(cmd)
        return build_exec_command(
            self._container_name,
            *command,
            workdir=str(cwd) if cwd else None,
            env=env,
            interactive=True,
        )

    @override
    @asynccontextmanager
    async def run(self) -> AsyncGenerator[Self]:
        await start_container(
            self.image_tag,
            name=self._container_name,
            command=("sleep", "infinity"),
            rm=False,
        )
        try:
            yield self
        finally:
            await stop_container(self._container_name)
            await rm_container(self._container_name)
            if self.is_temporary:
                await rm_image(self.image_tag)


@final
class ContainerSandboxBuilder(SandboxBuilder):
    @override
    async def build(
        self,
        containerfile: str,
        *,
        tag: str | None = None,
        build_args: BuildArgs | None = None,
        context: str | Path | None = None,
    ) -> ContainerSandbox:
        image_tag = tag or f"oa-evals-tmp-{uuid.uuid4().hex[:8]}"
        context_path = Path(context).resolve() if context else None

        if context_path and not context_path.exists():
            msg = f"Context path does not exist: {context_path}"
            raise FileNotFoundError(msg)

        await build_image(
            containerfile,
            context=context_path,
            tag=image_tag,
            build_args=build_args,
        )

        return ContainerSandbox(
            image_tag=image_tag,
            is_temporary=tag is None,
        )
