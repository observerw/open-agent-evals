from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path
from typing import Literal, Protocol

import attrs
from acp.schema import (
    AgentMessageChunk,
    AgentThoughtChunk,
    ToolCallProgress,
    ToolCallStart,
    ToolCallStatus,
    ToolKind,
    UserMessageChunk,
)
from openai.types.chat import (
    ChatCompletionAssistantMessageParam,
    ChatCompletionContentPartImageParam,
    ChatCompletionContentPartInputAudioParam,
    ChatCompletionContentPartParam,
    ChatCompletionContentPartTextParam,
    ChatCompletionMessageCustomToolCallParam,
    ChatCompletionMessageParam,
    ChatCompletionMessageToolCallUnionParam,
    ChatCompletionUserMessageParam,
)
from openai.types.chat.chat_completion_content_part_image_param import ImageURL
from openai.types.chat.chat_completion_content_part_input_audio_param import InputAudio
from openai.types.chat.chat_completion_content_part_param import File, FileFile
from openai.types.chat.chat_completion_message_custom_tool_call_param import Custom

from oa_evals.acp.types import SessionUpdate

from .model import TrajectoryData
from .schema import (
    AgentMessage,
    AgentThought,
    AudioContent,
    Content,
    ContentToolCallContent,
    EmbeddedResourceContent,
    FileEditToolCallContent,
    ImageContent,
    Message,
    MessageGroup,
    ResourceContent,
    TerminalToolCallContent,
    TextContent,
    ToolCall,
    ToolCallContent,
    Trajectory,
    UserMessage,
    from_content,
    from_tool_call_content,
)

type OpenAIUserContent = str | list[ChatCompletionContentPartParam]
type OpenAITextContent = str | list[ChatCompletionContentPartTextParam]


class MessageFactory[T](Protocol):
    def __call__(self, content: list[Content]) -> T: ...


@attrs.define
class MessageBuffer[T]:
    factory: MessageFactory[T]
    chunks: list[Content] = attrs.field(factory=list)

    def add(self, block: Content) -> None:
        self.chunks.append(block)

    def peek(self) -> T | None:
        return self.factory(list(self.chunks)) if self.chunks else None

    def flush(self) -> T | None:
        if not self.chunks:
            return None
        result = self.factory(list(self.chunks))
        self.chunks = []
        return result


@attrs.define
class ToolCallBuilder:
    tool_call_id: str
    title: str
    kind: ToolKind | None = None
    status: ToolCallStatus | None = None
    content: list[ToolCallContent] = attrs.field(factory=list)

    @classmethod
    def from_start(cls, update: ToolCallStart) -> ToolCallBuilder:
        return cls(
            tool_call_id=update.tool_call_id,
            kind=update.kind,
            title=update.title,
            status=update.status,
            content=[from_tool_call_content(c) for c in update.content]
            if update.content is not None
            else [],
        )

    def apply(self, update: ToolCallProgress) -> None:
        if update.kind is not None:
            self.kind = update.kind
        if update.title is not None:
            self.title = update.title
        if update.status is not None:
            self.status = update.status
        if update.content is not None:
            self.content = [from_tool_call_content(c) for c in update.content]

    def build(self) -> ToolCall:
        return ToolCall(
            tool_call_id=self.tool_call_id,
            title=self.title,
            kind=self.kind,
            content=list(self.content),
            status=self.status,
        )

    @property
    def is_complete(self) -> bool:
        return self.status in ("completed", "failed")


@attrs.define
class TrajectoryBuilder:
    _groups: list[list[Message]] = attrs.field(factory=lambda: [[]])
    _tool_calls: dict[str, ToolCallBuilder] = attrs.field(factory=dict)
    _buffers: dict[type, MessageBuffer[Message]] = attrs.field(
        factory=lambda: {
            UserMessageChunk: MessageBuffer(factory=UserMessage),
            AgentMessageChunk: MessageBuffer(factory=AgentMessage),
            AgentThoughtChunk: MessageBuffer(factory=AgentThought),
        }
    )
    _updates: list[SessionUpdate] = attrs.field(factory=list)

    @property
    def _current_group(self) -> list[Message]:
        """Get the current message group being built."""
        return self._groups[-1]

    def _flush_buffers(self, *, keep: type | None = None) -> None:
        for chunk_type, buffer in self._buffers.items():
            if chunk_type is not keep and (msg := buffer.flush()):
                self._current_group.append(msg)

    def _start_new_group(self) -> None:
        """Start a new message group (new LLM interaction cycle)."""
        self._groups.append([])

    def append(self, update: SessionUpdate) -> None:
        self._updates.append(update)
        match update:
            case UserMessageChunk() | AgentMessageChunk() | AgentThoughtChunk():
                self._flush_buffers(keep=type(update))
                self._buffers[type(update)].add(from_content(update.content))
            case ToolCallStart():
                self._flush_buffers()
                builder = ToolCallBuilder.from_start(update)
                self._tool_calls[update.tool_call_id] = builder
            case ToolCallProgress():
                builder = self._tool_calls.get(update.tool_call_id)
                if not builder:
                    raise ValueError(
                        f"Received progress update for unknown tool call ID: {update.tool_call_id}"
                    )
                builder.apply(update)
                if builder.is_complete:
                    tool_call = builder.build()
                    self._current_group.append(tool_call)
                    del self._tool_calls[update.tool_call_id]
                    # When a tool call completes, start a new group for the next LLM cycle
                    self._start_new_group()
            case _:
                pass

    def build(self) -> Trajectory:
        self._flush_buffers()

        for builder in self._tool_calls.values():
            self._current_group.append(builder.build())

        groups = [
            MessageGroup(messages=list(group_messages))
            for group_messages in self._groups
            if group_messages
        ]

        return Trajectory(groups=groups)

    def build_data(self) -> TrajectoryData:
        return TrajectoryData(updates=list(self._updates))

    @classmethod
    def build_from(cls, updates: Iterable[SessionUpdate]) -> Trajectory:
        builder = cls()
        for update in updates:
            builder.append(update)
        return builder.build()


def _audio_format(mime_type: str) -> Literal["wav", "mp3"] | None:
    normalized = mime_type.lower()
    match normalized:
        case "audio/wav" | "audio/x-wav" | "audio/wave":
            return "wav"
        case "audio/mpeg" | "audio/mp3":
            return "mp3"
        case _:
            return None


def _image_url(content: ImageContent) -> str:
    if content.uri and content.uri.startswith(("http://", "https://", "data:")):
        return content.uri
    return f"data:{content.mime_type};base64,{content.data}"


def _filename_from_uri(uri: str) -> str:
    name = Path(uri).name
    return name if name else "resource"


def _text_part(text: str) -> ChatCompletionContentPartTextParam:
    return ChatCompletionContentPartTextParam(type="text", text=text)


def _resource_text(content: ResourceContent) -> str:
    label = content.title or content.name or "resource"
    info: list[str] = [content.uri]
    if content.mime_type:
        info.append(content.mime_type)
    if content.size is not None:
        info.append(f"{content.size} bytes")
    detail = " | ".join(info)
    if content.description:
        return f"{label}: {content.description} ({detail})"
    return f"{label} ({detail})"


def _content_to_text(content: Content) -> str:
    match content:
        case TextContent(text=text):
            return text
        case ImageContent(uri=uri, mime_type=mime_type):
            return f"[image] {uri or mime_type}"
        case AudioContent(mime_type=mime_type):
            return f"[audio] {mime_type}"
        case ResourceContent() as resource:
            return _resource_text(resource)
        case EmbeddedResourceContent(text=text, blob=_, uri=uri, mime_type=mime_type):
            if text is not None:
                return text
            hint = mime_type or "unknown"
            suffix = f"{uri} ({hint})" if uri else hint
            return f"[embedded resource] {suffix}"


def _content_to_user_part(content: Content) -> ChatCompletionContentPartParam | None:
    match content:
        case TextContent(text=text):
            return _text_part(text)
        case ImageContent() as image:
            image_url = ImageURL(url=_image_url(image))
            return ChatCompletionContentPartImageParam(
                type="image_url", image_url=image_url
            )
        case AudioContent(data=data, mime_type=mime_type):
            if audio_format := _audio_format(mime_type):
                input_audio = InputAudio(data=data, format=audio_format)
                return ChatCompletionContentPartInputAudioParam(
                    type="input_audio", input_audio=input_audio
                )
            return None
        case EmbeddedResourceContent(text=text, blob=blob, uri=uri):
            if text is not None:
                return _text_part(text)
            if blob is not None:
                file_data = FileFile(
                    file_data=blob, filename=_filename_from_uri(uri)
                )
                return File(type="file", file=file_data)
            return None
        case ResourceContent():
            return None


def _compact_user_parts(
    parts: list[ChatCompletionContentPartParam],
) -> OpenAIUserContent:
    if not parts:
        return ""
    if len(parts) == 1 and parts[0]["type"] == "text":
        return parts[0]["text"]
    return parts


def _compact_text_parts(
    parts: list[ChatCompletionContentPartTextParam],
) -> OpenAITextContent:
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]["text"]
    return parts


def _content_to_user_message(content: list[Content]) -> OpenAIUserContent:
    parts: list[ChatCompletionContentPartParam] = []
    for item in content:
        if part := _content_to_user_part(item):
            parts.append(part)
            continue
        parts.append(_text_part(_content_to_text(item)))
    return _compact_user_parts(parts)


def _content_to_assistant_message(content: list[Content]) -> OpenAITextContent:
    parts = [_text_part(_content_to_text(item)) for item in content]
    return _compact_text_parts(parts)


def _tool_call_content_payload(content: ToolCallContent) -> dict[str, object]:
    match content:
        case TerminalToolCallContent(terminal_id=terminal_id):
            return {"type": "terminal", "terminal_id": terminal_id}
        case FileEditToolCallContent(diff=diff):
            return {
                "type": "diff",
                "path": str(diff.file_path),
                "old_text": diff.old_text,
                "new_text": diff.new_text,
            }
        case ContentToolCallContent(content=inner):
            return {"type": "content", "content": _content_to_text(inner)}


def _tool_call_payload(tool_call: ToolCall) -> dict[str, object]:
    return {
        "tool_call_id": tool_call.tool_call_id,
        "title": tool_call.title,
        "kind": tool_call.kind,
        "status": tool_call.status,
        "content": [_tool_call_content_payload(item) for item in tool_call.content],
    }


def _sanitize_tool_name(name: str) -> str:
    cleaned = "".join(
        ch if (ch.isascii() and (ch.isalnum() or ch in "-_")) else "_"
        for ch in name
    )
    cleaned = cleaned.strip("_-")
    if not cleaned:
        return "tool_call"
    return cleaned[:64]


@attrs.define
class OpenAIBuilder:
    include_thoughts: bool = True
    include_tool_calls: bool = True
    thought_name: str | None = "thought"
    _messages: list[ChatCompletionMessageParam] = attrs.field(factory=list, init=False)

    def append(self, message: Message) -> None:
        if openai_message := self._convert_message(message):
            self._messages.append(openai_message)

    def extend(self, messages: Iterable[Message]) -> None:
        for message in messages:
            self.append(message)

    def build(self) -> list[ChatCompletionMessageParam]:
        return list(self._messages)

    @classmethod
    def build_from(
        cls,
        messages: Iterable[Message],
        *,
        include_thoughts: bool = True,
        include_tool_calls: bool = True,
        thought_name: str | None = "thought",
    ) -> list[ChatCompletionMessageParam]:
        builder = cls(
            include_thoughts=include_thoughts,
            include_tool_calls=include_tool_calls,
            thought_name=thought_name,
        )
        builder.extend(messages)
        return builder.build()

    def _convert_message(self, message: Message) -> ChatCompletionMessageParam | None:
        match message:
            case UserMessage(content=content):
                return ChatCompletionUserMessageParam(
                    role="user", content=_content_to_user_message(content)
                )
            case AgentMessage(content=content):
                return ChatCompletionAssistantMessageParam(
                    role="assistant",
                    content=_content_to_assistant_message(content),
                )
            case AgentThought(content=content):
                if not self.include_thoughts:
                    return None
                if self.thought_name:
                    return ChatCompletionAssistantMessageParam(
                        role="assistant",
                        content=_content_to_assistant_message(content),
                        name=self.thought_name,
                    )
                return ChatCompletionAssistantMessageParam(
                    role="assistant",
                    content=_content_to_assistant_message(content),
                )
            case ToolCall() as tool_call:
                if not self.include_tool_calls:
                    return None
                return self._tool_call_message(tool_call)

    def _tool_call_message(self, tool_call: ToolCall) -> ChatCompletionMessageParam:
        raw_name = tool_call.title or tool_call.kind or "tool_call"
        payload = _tool_call_payload(tool_call)
        custom = Custom(
            name=_sanitize_tool_name(raw_name),
            input=json.dumps(payload, ensure_ascii=False),
        )
        tool_call_param = ChatCompletionMessageCustomToolCallParam(
            id=tool_call.tool_call_id, type="custom", custom=custom
        )
        tool_calls: list[ChatCompletionMessageToolCallUnionParam] = [tool_call_param]
        return ChatCompletionAssistantMessageParam(
            role="assistant", content=None, tool_calls=tool_calls
        )
