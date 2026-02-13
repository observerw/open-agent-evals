from __future__ import annotations

import base64
from abc import ABC, abstractmethod
from collections.abc import Iterator
from pathlib import Path
from typing import Self, override

from acp import schema as acp_schema
from acp.schema import ToolCallStatus, ToolKind
from attrs import frozen
from pydantic import BaseModel


class ContentBase[T: BaseModel](ABC):
    @classmethod
    @abstractmethod
    def from_data(cls, data: T) -> Self:
        """Construct the schema from the corresponding data model."""


@frozen
class TextContent(ContentBase[acp_schema.TextContentBlock]):
    text: str

    @override
    @classmethod
    def from_data(cls, data: acp_schema.TextContentBlock) -> Self:
        return cls(text=data.text)


@frozen
class ImageContent(ContentBase[acp_schema.ImageContentBlock]):
    data: str
    mime_type: str
    uri: str | None

    @override
    @classmethod
    def from_data(cls, data: acp_schema.ImageContentBlock) -> Self:
        return cls(data=data.data, mime_type=data.mime_type, uri=data.uri)

    def get_bytes(self) -> bytes:
        return base64.b64decode(self.data)


@frozen
class AudioContent(ContentBase[acp_schema.AudioContentBlock]):
    data: str
    mime_type: str

    @override
    @classmethod
    def from_data(cls, data: acp_schema.AudioContentBlock) -> Self:
        return cls(data=data.data, mime_type=data.mime_type)

    def get_bytes(self) -> bytes:
        return base64.b64decode(self.data)


@frozen
class ResourceContent(ContentBase[acp_schema.ResourceContentBlock]):
    uri: str
    name: str
    title: str | None
    description: str | None
    mime_type: str | None
    size: int | None

    @override
    @classmethod
    def from_data(cls, data: acp_schema.ResourceContentBlock) -> Self:
        return cls(
            uri=data.uri,
            name=data.name,
            title=data.title,
            description=data.description,
            mime_type=data.mime_type,
            size=data.size,
        )


@frozen
class EmbeddedResourceContent(ContentBase[acp_schema.EmbeddedResourceContentBlock]):
    uri: str
    mime_type: str | None
    text: str | None
    blob: str | None

    @override
    @classmethod
    def from_data(cls, data: acp_schema.EmbeddedResourceContentBlock) -> Self:
        match data.resource:
            case acp_schema.TextResourceContents(
                uri=uri, mime_type=mime_type, text=text
            ):
                return cls(uri=uri, mime_type=mime_type, text=text, blob=None)
            case acp_schema.BlobResourceContents(
                uri=uri, mime_type=mime_type, blob=blob
            ):
                return cls(uri=uri, mime_type=mime_type, text=None, blob=blob)

    def get_bytes(self) -> bytes | None:
        if self.blob:
            return base64.b64decode(self.blob)
        return None


type Content = (
    TextContent
    | ImageContent
    | AudioContent
    | ResourceContent
    | EmbeddedResourceContent
)


def from_content(
    data: acp_schema.TextContentBlock
    | acp_schema.ImageContentBlock
    | acp_schema.AudioContentBlock
    | acp_schema.ResourceContentBlock
    | acp_schema.EmbeddedResourceContentBlock,
) -> Content:
    match data:
        case acp_schema.TextContentBlock():
            return TextContent.from_data(data)
        case acp_schema.ImageContentBlock():
            return ImageContent.from_data(data)
        case acp_schema.AudioContentBlock():
            return AudioContent.from_data(data)
        case acp_schema.ResourceContentBlock():
            return ResourceContent.from_data(data)
        case acp_schema.EmbeddedResourceContentBlock():
            return EmbeddedResourceContent.from_data(data)


def from_tool_call_content(
    data: acp_schema.TerminalToolCallContent
    | acp_schema.FileEditToolCallContent
    | acp_schema.ContentToolCallContent,
) -> ToolCallContent:
    match data:
        case acp_schema.TerminalToolCallContent():
            return TerminalToolCallContent.from_data(data)
        case acp_schema.FileEditToolCallContent():
            return FileEditToolCallContent.from_data(data)
        case acp_schema.ContentToolCallContent():
            return ContentToolCallContent.from_data(data)


@frozen
class PromptRequest(ContentBase[acp_schema.PromptRequest]):
    content: list[Content]

    @override
    @classmethod
    def from_data(cls, data: acp_schema.PromptRequest) -> Self:
        return cls(content=[from_content(c) for c in data.content])


@frozen
class PromptResponse(ContentBase[acp_schema.PromptResponse]):
    stop_reason: str

    @override
    @classmethod
    def from_data(cls, data: acp_schema.PromptResponse) -> Self:
        return cls(stop_reason=data.stop_reason)


@frozen
class TerminalToolCallContent(ContentBase[acp_schema.TerminalToolCallContent]):
    terminal_id: str

    @override
    @classmethod
    def from_data(cls, data: acp_schema.TerminalToolCallContent) -> Self:
        return cls(terminal_id=data.terminal_id)


@frozen
class Diff(ContentBase[acp_schema.Diff]):
    file_path: Path
    old_text: str | None
    new_text: str

    @override
    @classmethod
    def from_data(cls, data: acp_schema.Diff) -> Self:
        return cls(
            file_path=Path(data.path),
            old_text=data.old_text,
            new_text=data.new_text,
        )


@frozen
class FileEditToolCallContent(ContentBase[acp_schema.FileEditToolCallContent]):
    diff: Diff

    @override
    @classmethod
    def from_data(cls, data: acp_schema.FileEditToolCallContent) -> Self:
        return cls(diff=Diff.from_data(data))


@frozen
class ContentToolCallContent(ContentBase[acp_schema.ContentToolCallContent]):
    content: Content

    @override
    @classmethod
    def from_data(cls, data: acp_schema.ContentToolCallContent) -> Self:
        content = from_content(data.content)
        return cls(content=content)


type ToolCallContent = (
    TerminalToolCallContent | FileEditToolCallContent | ContentToolCallContent
)


@frozen
class UserMessage(ContentBase[acp_schema.UserMessageChunk]):
    content: list[Content]

    @override
    @classmethod
    def from_data(cls, data: acp_schema.UserMessageChunk) -> Self:
        return cls(content=[from_content(data.content)])


@frozen
class AgentMessage(ContentBase[acp_schema.AgentMessageChunk]):
    content: list[Content]

    @override
    @classmethod
    def from_data(cls, data: acp_schema.AgentMessageChunk) -> Self:
        return cls(content=[from_content(data.content)])


@frozen
class AgentThought(ContentBase[acp_schema.AgentThoughtChunk]):
    content: list[Content]

    @override
    @classmethod
    def from_data(cls, data: acp_schema.AgentThoughtChunk) -> Self:
        return cls(content=[from_content(data.content)])


@frozen
class ToolCall:
    tool_call_id: str
    title: str
    kind: ToolKind | None
    content: list[ToolCallContent]
    status: ToolCallStatus | None


type Message = UserMessage | AgentMessage | AgentThought | ToolCall


@frozen
class MessageGroup:
    """A group of messages within a single LLM interaction cycle.

    Each group contains messages from one LLM call until a stop point
    (typically when tool calls are needed or the turn completes).
    """

    messages: list[Message]


@frozen
class Trajectory:
    """A sequence of message groups representing a complete prompt turn.

    Messages are organized into groups according to the ACP protocol,
    where each group corresponds to a single LLM interaction cycle.
    """

    groups: list[MessageGroup]

    @property
    def messages(self) -> list[Message]:
        return [msg for group in self.groups for msg in group.messages]

    def __iter__(self) -> Iterator[Message]:
        for group in self.groups:
            yield from group.messages
