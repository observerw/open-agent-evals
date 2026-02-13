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

from oa_evals.utils.process import run_process

from ..abc import Sandbox, SandboxBuilder, Terminal
from ..exceptions import FileOperationError
from ..schema import BuildArgs, CommandResult
from .utils import (
    build_image,
    download_from_container,
    exec_container,
    get_backend,
    rm_container,
    rm_image,
    stop_container,
    upload_to_container,
)


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
        cmd = ["cat", str(path)]
        if line is not None:
            # line is 0-indexed in SandboxPath but we'll assume 1-indexed for sed or just handle it
            # Actually abc.py doesn't specify. Usually it's 1-indexed for line numbers.
            # Let's use sed -n 'Xp'
            cmd = ["sed", "-n", f"{line}p", str(path)]
        elif limit is not None:
            cmd = ["head", "-n", str(limit), str(path)]

        result = await exec_container(self._container_name, *cmd, check=False)
        if result.returncode != 0:
            raise FileOperationError(f"Failed to read file {path}: {result.stderr}")
        return result.stdout

    @override
    async def write_file(self, path: Path, content: str) -> None:
        # Use sh -c "cat > path" to write content
        result = await exec_container(
            self._container_name,
            "sh",
            "-c",
            f"cat > {path}",
            input=content,
            check=False,
        )
        if result.returncode != 0:
            raise FileOperationError(f"Failed to write file {path}: {result.stderr}")

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
        args = self._build_args(*cmd, cwd=cwd, env=env)
        return ContainerTerminal(args=args, timeout=timeout)

    @override
    async def acp(
        self,
        client: Client,
        *cmd: str,
        cwd: str | Path | None = None,
        env: Mapping[str, str] | None = None,
    ) -> ClientSideConnection:
        args = self._build_args(*cmd, cwd=cwd, env=env)
        process = await asyncio.create_subprocess_exec(
            *args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        assert process.stdin and process.stdout
        return connect_to_agent(client, process.stdin, process.stdout)

    def _build_args(
        self,
        *cmd: str,
        cwd: str | Path | None = None,
        env: Mapping[str, str] | None = None,
    ) -> list[str]:
        backend = get_backend()
        args = [backend, "exec", "-i"]
        if cwd:
            args.extend(["--workdir", str(cwd)])
        if env:
            for k, v in env.items():
                args.extend(["-e", f"{k}={v}"])
        args.append(self._container_name)
        # FIXME how to exec command?
        args.extend(["sh", "-c", "".join(cmd)])
        return args

    @override
    @asynccontextmanager
    async def run(self) -> AsyncGenerator[Self]:
        backend = get_backend()
        cmd = [
            backend,
            "run",
            "-d",
            "--name",
            self._container_name,
            self.image_tag,
            "sleep",
            "infinity",
        ]
        await run_process(*cmd)

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
