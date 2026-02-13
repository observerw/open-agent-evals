from __future__ import annotations

import asyncio
import codecs
import shlex
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, suppress
from pathlib import Path, PurePosixPath
from typing import Protocol, Self, final, override

import anyio
from acp import Client, connect_to_agent
from acp.client import ClientSideConnection
from anyio.abc import ObjectReceiveStream, ObjectSendStream
from attrs import define, field
from e2b import AsyncSandbox, AsyncTemplate, CommandExitException, FileType

from ..abc import Sandbox, SandboxBuilder, Terminal
from ..exceptions import FileOperationError, SandboxError, TerminalOperationError
from ..schema import BuildArgs, CommandResult


class _E2BResult(Protocol):
    stdout: str
    stderr: str
    exit_code: int


class _E2BHandle(Protocol):
    @property
    def pid(self) -> int: ...

    async def wait(self) -> _E2BResult: ...

    async def kill(self) -> bool: ...


def _merge_output(result: _E2BResult) -> str:
    return f"{result.stdout}{result.stderr}"


def _to_result(result: _E2BResult) -> CommandResult:
    return CommandResult(
        exit_code=result.exit_code,
        output=_merge_output(result),
    )


def _format_cmd(cmd: tuple[str, ...]) -> str:
    if not cmd:
        raise TerminalOperationError("Command cannot be empty")
    if len(cmd) == 1:
        return cmd[0]
    return shlex.join(cmd)


def _slice_content(content: str, *, limit: int | None, line: int | None) -> str:
    if line is None and limit is None:
        return content

    lines = content.splitlines(keepends=True)
    if line is not None:
        idx = line - 1
        if idx < 0 or idx >= len(lines):
            return ""
        return lines[idx]

    if not limit or limit <= 0:
        return ""
    return "".join(lines[:limit])


@define
class E2BTerminal(Terminal):
    sandbox: AsyncSandbox
    cmd: str
    cwd: str | None = None
    env: dict[str, str] | None = None
    timeout: float | None = None

    _handle: _E2BHandle | None = field(init=False, default=None)
    _lock: anyio.Lock = field(init=False, factory=anyio.Lock)
    _send: ObjectSendStream[str] | None = field(init=False, default=None)
    _recv: ObjectReceiveStream[str] | None = field(init=False, default=None)
    _watch: asyncio.Task[None] | None = field(init=False, default=None)

    async def _ensure_started(self, *, stream: bool) -> _E2BHandle:
        if self._handle is not None:
            return self._handle

        async with self._lock:
            if self._handle is not None:
                return self._handle

            on_stdout = None
            on_stderr = None
            if stream:
                send, recv = anyio.create_memory_object_stream[str](256)
                self._send = send
                self._recv = recv

                async def on_chunk(chunk: str) -> None:
                    await send.send(chunk)

                on_stdout = on_chunk
                on_stderr = on_chunk

            timeout = 0 if self.timeout is None else self.timeout
            handle = await self.sandbox.commands.run(
                self.cmd,
                background=True,
                cwd=self.cwd,
                envs=self.env,
                timeout=timeout,
                on_stdout=on_stdout,
                on_stderr=on_stderr,
            )
            self._handle = handle

            if self._send is not None:
                send = self._send
                self._watch = asyncio.create_task(
                    self._close_stream_on_exit(handle, send)
                )

        return handle

    async def _close_stream(self) -> None:
        if self._send is None:
            return

        send = self._send
        self._send = None
        with suppress(Exception):
            await send.aclose()

    async def _close_stream_on_exit(
        self,
        handle: _E2BHandle,
        send: ObjectSendStream[str],
    ) -> None:
        try:
            await handle.wait()
        except CommandExitException:
            pass
        finally:
            with suppress(Exception):
                await send.aclose()

    @override
    async def wait(self) -> CommandResult:
        handle = await self._ensure_started(stream=False)
        try:
            result = await handle.wait()
            return _to_result(result)
        except CommandExitException as exc:
            return _to_result(exc)
        finally:
            await self._close_stream()

    @override
    async def kill(self) -> None:
        if self._handle is None:
            return

        with suppress(Exception):
            _ = await self._handle.kill()
        await self._close_stream()

    @override
    async def stream(self) -> AsyncGenerator[str]:
        if self._handle is not None and self._recv is None:
            result = await self.wait()
            if result.output:
                yield result.output
            return

        _ = await self._ensure_started(stream=True)
        if self._recv is None:
            return

        recv = self._recv
        async with recv:
            async for chunk in recv:
                yield chunk


@define
class _ACPBridge:
    sandbox: AsyncSandbox
    cmd: str
    cwd: str | None = None
    env: dict[str, str] | None = None
    timeout: float | None = None

    _server: asyncio.AbstractServer | None = field(init=False, default=None)
    _ready: asyncio.Event = field(init=False, factory=asyncio.Event)
    _error: Exception | None = field(init=False, default=None)
    _handle: _E2BHandle | None = field(init=False, default=None)

    async def open(self) -> tuple[asyncio.StreamWriter, asyncio.StreamReader]:
        async def handle_client(
            reader: asyncio.StreamReader,
            writer: asyncio.StreamWriter,
        ) -> None:
            try:
                await self._run(reader, writer)
            except Exception as exc:  # noqa: BLE001 - surface bridge failures
                self._error = exc
                self._ready.set()
                writer.close()
                with suppress(Exception):
                    await writer.wait_closed()

        self._server = await asyncio.start_server(handle_client, "127.0.0.1", 0)
        if not self._server.sockets:
            msg = "Failed to create ACP bridge server"
            raise TerminalOperationError(msg)

        host, port = self._server.sockets[0].getsockname()[:2]
        output_stream, input_stream = await asyncio.open_connection(host, port)

        await self._ready.wait()
        self._server.close()
        await self._server.wait_closed()

        if self._error is not None:
            input_stream.close()
            with suppress(Exception):
                await input_stream.wait_closed()
            raise self._error

        return input_stream, output_stream

    async def _run(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        async def on_output(chunk: str) -> None:
            writer.write(chunk.encode())
            await writer.drain()

        timeout = 0 if self.timeout is None else self.timeout
        handle = await self.sandbox.commands.run(
            self.cmd,
            background=True,
            stdin=True,
            cwd=self.cwd,
            envs=self.env,
            timeout=timeout,
            on_stdout=on_output,
            on_stderr=on_output,
        )
        self._handle = handle
        self._ready.set()

        stdin_task = asyncio.create_task(self._pipe_stdin(reader, handle.pid))
        wait_task = asyncio.create_task(self._wait_command(handle, writer))

        done, pending = await asyncio.wait(
            {stdin_task, wait_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if stdin_task in done and not wait_task.done():
            with suppress(Exception):
                _ = await handle.kill()
            await wait_task

        for task in pending:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    async def _pipe_stdin(self, reader: asyncio.StreamReader, pid: int) -> None:
        decoder = codecs.getincrementaldecoder("utf-8")()

        while data := await reader.read(65536):
            text = decoder.decode(data)
            if text:
                await self.sandbox.commands.send_stdin(pid, text)

        tail = decoder.decode(b"", final=True)
        if tail:
            await self.sandbox.commands.send_stdin(pid, tail)

    async def _wait_command(
        self,
        handle: _E2BHandle,
        writer: asyncio.StreamWriter,
    ) -> None:
        try:
            await handle.wait()
        except CommandExitException:
            pass
        finally:
            writer.close()
            with suppress(Exception):
                await writer.wait_closed()

    async def close(self) -> None:
        if self._handle is None:
            return

        with suppress(Exception):
            _ = await self._handle.kill()


@define
class E2BSandbox(Sandbox):
    template: str
    timeout: int = 3600

    _sandbox: AsyncSandbox | None = field(init=False, default=None)
    _bridges: set[_ACPBridge] = field(init=False, factory=set)

    def _current(self) -> AsyncSandbox:
        if self._sandbox is None:
            msg = "Sandbox is not running"
            raise SandboxError(msg)
        return self._sandbox

    @override
    async def read_file(
        self,
        path: Path,
        *,
        limit: int | None = None,
        line: int | None = None,
    ) -> str:
        try:
            content = await self._current().files.read(path.as_posix())
            return _slice_content(content, limit=limit, line=line)
        except Exception as exc:
            msg = f"Failed to read file {path}: {exc}"
            raise FileOperationError(msg) from exc

    @override
    async def write_file(self, path: Path, content: str) -> None:
        try:
            await self._current().files.write(path.as_posix(), content)
        except Exception as exc:
            msg = f"Failed to write file {path}: {exc}"
            raise FileOperationError(msg) from exc

    @override
    async def upload_file(self, local_path: Path, container_path: Path) -> None:
        if not local_path.exists():
            msg = f"Local path does not exist: {local_path}"
            raise FileOperationError(msg)

        fs = self._current().files
        if local_path.is_file():
            try:
                await fs.write(container_path.as_posix(), local_path.read_bytes())
            except Exception as exc:
                msg = f"Failed to upload {local_path} to {container_path}: {exc}"
                raise FileOperationError(msg) from exc
            return

        if not local_path.is_dir():
            msg = f"Unsupported local path type: {local_path}"
            raise FileOperationError(msg)

        try:
            await fs.make_dir(container_path.as_posix())
            for item in sorted(local_path.rglob("*")):
                rel = item.relative_to(local_path)
                target = (container_path / rel).as_posix()

                if item.is_dir():
                    await fs.make_dir(target)
                    continue

                if item.is_file():
                    await fs.write(target, item.read_bytes())
        except Exception as exc:
            msg = f"Failed to upload {local_path} to {container_path}: {exc}"
            raise FileOperationError(msg) from exc

    @override
    async def download_file(self, remote_path: Path, container_path: Path) -> None:
        fs = self._current().files
        remote = PurePosixPath(remote_path.as_posix())
        try:
            info = await fs.get_info(remote.as_posix())
        except Exception as exc:
            msg = f"Failed to download {remote_path} to {container_path}: {exc}"
            raise FileOperationError(msg) from exc

        if info.type == FileType.FILE:
            target = container_path
            if container_path.exists() and container_path.is_dir():
                target = container_path / remote.name
            target.parent.mkdir(parents=True, exist_ok=True)
            try:
                data = await fs.read(remote.as_posix(), format="bytes")
            except Exception as exc:
                msg = f"Failed to download {remote_path} to {container_path}: {exc}"
                raise FileOperationError(msg) from exc
            target.write_bytes(bytes(data))
            return

        if info.type != FileType.DIR:
            msg = f"Unsupported remote entry type for {remote_path}"
            raise FileOperationError(msg)

        if container_path.exists() and not container_path.is_dir():
            msg = f"Local path is not a directory: {container_path}"
            raise FileOperationError(msg)
        container_path.mkdir(parents=True, exist_ok=True)

        try:
            pending = [remote]
            while pending:
                current = pending.pop()
                entries = await fs.list(current.as_posix(), depth=1)

                for entry in entries:
                    entry_path = PurePosixPath(entry.path)
                    if entry_path == current:
                        continue

                    rel = entry_path.relative_to(remote)
                    local_path = container_path / Path(rel.as_posix())

                    if entry.type == FileType.DIR:
                        local_path.mkdir(parents=True, exist_ok=True)
                        pending.append(entry_path)
                        continue

                    local_path.parent.mkdir(parents=True, exist_ok=True)
                    data = await fs.read(entry.path, format="bytes")
                    local_path.write_bytes(bytes(data))
        except Exception as exc:
            msg = f"Failed to download {remote_path} to {container_path}: {exc}"
            raise FileOperationError(msg) from exc

    @override
    async def exists(self, path: Path) -> bool:
        return await self._current().files.exists(path.as_posix())

    @override
    def terminal(
        self,
        *cmd: str,
        cwd: str | Path | None = None,
        env: Mapping[str, str] | None = None,
        timeout: float | None = None,
    ) -> E2BTerminal:
        return E2BTerminal(
            sandbox=self._current(),
            cmd=_format_cmd(cmd),
            cwd=cwd,
            env=env,
            timeout=timeout,
        )

    @override
    async def acp(
        self,
        client: Client,
        *cmd: str,
        cwd: str | None = None,
        env: dict[str, str] | None = None,
    ) -> ClientSideConnection:
        bridge = _ACPBridge(
            sandbox=self._current(),
            cmd=_format_cmd(cmd),
            cwd=cwd,
            env=env,
        )
        self._bridges.add(bridge)

        try:
            input_stream, output_stream = await bridge.open()
            return connect_to_agent(client, input_stream, output_stream)
        except Exception as exc:
            self._bridges.discard(bridge)
            msg = f"Failed to establish ACP connection: {exc}"
            raise TerminalOperationError(msg) from exc

    @override
    @asynccontextmanager
    async def run(self) -> AsyncGenerator[Self, None]:
        self._sandbox = await AsyncSandbox.create(
            template=self.template,
            timeout=self.timeout,
        )

        try:
            yield self
        finally:
            for bridge in tuple(self._bridges):
                await bridge.close()
            self._bridges.clear()

            if self._sandbox is not None:
                await AsyncSandbox.kill(self._sandbox.sandbox_id)
            self._sandbox = None


@final
@define
class E2BSandboxBuilder(SandboxBuilder):
    timeout: int = 3600

    @override
    async def build(
        self,
        containerfile: str,
        *,
        tag: str | None = None,
        build_args: BuildArgs | None = None,
        context: str | Path | None = None,
    ) -> E2BSandbox:
        if build_args:
            msg = "E2B sandbox build does not support build_args"
            raise SandboxError(msg)

        context_path = Path(context).resolve() if context else Path.cwd()
        if not context_path.exists():
            msg = f"Context path does not exist: {context_path}"
            raise FileNotFoundError(msg)

        name = tag or f"oa-evals-{uuid.uuid4().hex[:8]}"
        name = "".join(ch.lower() if ch.isalnum() else "-" for ch in name).strip("-")
        if not name:
            name = f"oa-evals-{uuid.uuid4().hex[:8]}"

        try:
            template = AsyncTemplate(file_context_path=context_path).from_dockerfile(
                containerfile
            )
            build_info = await AsyncTemplate.build(template, name=name)
            return E2BSandbox(template=build_info.name, timeout=self.timeout)
        except Exception as exc:
            msg = f"Failed to build E2B template {name}: {exc}"
            raise SandboxError(msg) from exc
