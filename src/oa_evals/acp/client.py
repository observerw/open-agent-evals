from __future__ import annotations

from typing import Any, final, override

import anyio
from acp import Agent, Client, RequestError, TerminalHandle
from acp.schema import (
    AgentMessageChunk,
    AgentPlanUpdate,
    AgentThoughtChunk,
    AvailableCommandsUpdate,
    CreateTerminalResponse,
    CurrentModeUpdate,
    EnvVariable,
    KillTerminalCommandResponse,
    PermissionOption,
    ReadTextFileResponse,
    ReleaseTerminalResponse,
    RequestPermissionResponse,
    SessionInfoUpdate,
    TerminalOutputResponse,
    ToolCallProgress,
    ToolCallStart,
    ToolCallUpdate,
    UserMessageChunk,
    WaitForTerminalExitResponse,
    WriteTextFileResponse,
)
from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from attrs import define, field, frozen

from .types import SessionUpdate


@frozen
class UpdateStream:
    send: MemoryObjectSendStream[SessionUpdate]
    recv: MemoryObjectReceiveStream[SessionUpdate]


@final
@define
class ReadonlyACPClient(Client):
    """Simple ACP client that only receives session updates and streams them."""

    _streams: dict[str, UpdateStream] = field(factory=dict, init=False)

    def _get_stream(self, session_id: str) -> UpdateStream:
        if session_id not in self._streams:
            send, recv = anyio.create_memory_object_stream[SessionUpdate]()
            self._streams[session_id] = UpdateStream(send=send, recv=recv)
        return self._streams[session_id]

    @override
    async def session_update(
        self,
        session_id: str,
        update: UserMessageChunk
        | AgentMessageChunk
        | AgentThoughtChunk
        | ToolCallStart
        | ToolCallProgress
        | AgentPlanUpdate
        | AvailableCommandsUpdate
        | CurrentModeUpdate
        | SessionInfoUpdate,
        **kwargs: Any,
    ) -> None:
        await self._get_stream(session_id).send.send(update)

    @override
    async def request_permission(
        self,
        options: list[PermissionOption],
        session_id: str,
        tool_call: ToolCallUpdate,
        **kwargs: Any,
    ) -> RequestPermissionResponse:
        raise RequestError.method_not_found("request_permission")

    @override
    async def write_text_file(
        self, content: str, path: str, session_id: str, **kwargs: Any
    ) -> WriteTextFileResponse | None:
        raise RequestError.method_not_found("write_text_file")

    @override
    async def read_text_file(
        self,
        path: str,
        session_id: str,
        limit: int | None = None,
        line: int | None = None,
        **kwargs: Any,
    ) -> ReadTextFileResponse:
        raise RequestError.method_not_found("read_text_file")

    @override
    async def create_terminal(
        self,
        command: str,
        session_id: str,
        args: list[str] | None = None,
        cwd: str | None = None,
        env: list[EnvVariable] | None = None,
        output_byte_limit: int | None = None,
        **kwargs: Any,
    ) -> CreateTerminalResponse | TerminalHandle:
        raise RequestError.method_not_found("create_terminal")

    @override
    async def terminal_output(
        self, session_id: str, terminal_id: str, **kwargs: Any
    ) -> TerminalOutputResponse:
        raise RequestError.method_not_found("terminal_output")

    @override
    async def release_terminal(
        self, session_id: str, terminal_id: str, **kwargs: Any
    ) -> ReleaseTerminalResponse | None:
        raise RequestError.method_not_found("release_terminal")

    @override
    async def wait_for_terminal_exit(
        self, session_id: str, terminal_id: str, **kwargs: Any
    ) -> WaitForTerminalExitResponse:
        raise RequestError.method_not_found("wait_for_terminal_exit")

    @override
    async def kill_terminal(
        self, session_id: str, terminal_id: str, **kwargs: Any
    ) -> KillTerminalCommandResponse | None:
        raise RequestError.method_not_found("kill_terminal")

    @override
    async def ext_method(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        return {}

    @override
    async def ext_notification(self, method: str, params: dict[str, Any]) -> None: ...

    @override
    def on_connect(self, conn: Agent) -> None: ...

    def stream_update(
        self, session_id: str
    ) -> MemoryObjectReceiveStream[SessionUpdate]:
        return self._get_stream(session_id).recv
