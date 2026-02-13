from __future__ import annotations

import json
from pathlib import Path
from typing import cast

from openai.types.chat import (
    ChatCompletionAssistantMessageParam,
    ChatCompletionUserMessageParam,
)

from oa_evals.acp.builder import OpenAIBuilder
from oa_evals.acp.schema import (
    AgentMessage,
    AgentThought,
    AudioContent,
    ContentToolCallContent,
    Diff,
    EmbeddedResourceContent,
    FileEditToolCallContent,
    ImageContent,
    ResourceContent,
    TerminalToolCallContent,
    TextContent,
    ToolCall,
    UserMessage,
)


def test_openai_builder_user_message_text():
    builder = OpenAIBuilder()
    builder.append(UserMessage(content=[TextContent(text="Hello")]))
    assert builder.build() == [{"role": "user", "content": "Hello"}]


def test_openai_builder_thought_name():
    builder = OpenAIBuilder()
    builder.append(AgentThought(content=[TextContent(text="Thinking")]))
    message = cast(ChatCompletionAssistantMessageParam, builder.build()[0])
    assert message["role"] == "assistant"
    assert message.get("content") == "Thinking"
    assert message.get("name") == "thought"


def test_openai_builder_tool_call_custom_payload():
    builder = OpenAIBuilder()
    tool_call = ToolCall(
        tool_call_id="t1",
        title="run",
        kind="execute",
        content=[TerminalToolCallContent(terminal_id="term1")],
        status="completed",
    )
    builder.append(tool_call)

    message = cast(ChatCompletionAssistantMessageParam, builder.build()[0])
    assert message["role"] == "assistant"
    assert message.get("content") is None

    tool_calls = list(message.get("tool_calls", []))
    assert tool_calls[0]["id"] == "t1"
    assert tool_calls[0]["type"] == "custom"

    tool_call_param = tool_calls[0]
    assert tool_call_param["type"] == "custom"
    custom_call = tool_call_param
    payload = cast(dict[str, object], json.loads(custom_call["custom"]["input"]))
    assert payload["tool_call_id"] == "t1"
    items = cast(list[dict[str, object]], payload["content"])
    assert items[0]["type"] == "terminal"


def test_openai_builder_user_message_multipart():
    builder = OpenAIBuilder()
    builder.append(
        UserMessage(
            content=[
                TextContent(text="Hello"),
                ImageContent(data="abc123", mime_type="image/png", uri=None),
                AudioContent(data="ZGF0YQ==", mime_type="audio/wav"),
            ]
        )
    )
    message = cast(ChatCompletionUserMessageParam, builder.build()[0])
    assert message["role"] == "user"
    parts = message["content"]
    assert isinstance(parts, list)
    assert parts[0] == {"type": "text", "text": "Hello"}
    assert parts[1]["type"] == "image_url"
    assert parts[1]["image_url"]["url"].startswith("data:image/png;base64,")
    assert parts[2]["type"] == "input_audio"
    assert parts[2]["input_audio"]["format"] == "wav"


def test_openai_builder_user_message_resource_fallback():
    builder = OpenAIBuilder()
    builder.append(
        UserMessage(
            content=[
                ResourceContent(
                    uri="file:///tmp/doc.txt",
                    name="doc.txt",
                    title=None,
                    description="Example",
                    mime_type="text/plain",
                    size=12,
                )
            ]
        )
    )
    message = cast(ChatCompletionUserMessageParam, builder.build()[0])
    assert message["role"] == "user"
    content = message["content"]
    assert isinstance(content, str)
    assert content.startswith("doc.txt: Example")


def test_openai_builder_user_message_embedded_blob():
    builder = OpenAIBuilder()
    builder.append(
        UserMessage(
            content=[
                EmbeddedResourceContent(
                    uri="data.bin",
                    mime_type="application/octet-stream",
                    text=None,
                    blob="ZGF0YQ==",
                )
            ]
        )
    )
    message = cast(ChatCompletionUserMessageParam, builder.build()[0])
    parts = message["content"]
    assert isinstance(parts, list)
    assert parts[0]["type"] == "file"
    file_info = parts[0]["file"]
    assert file_info.get("filename") == "data.bin"


def test_openai_builder_user_message_embedded_text():
    builder = OpenAIBuilder()
    builder.append(
        UserMessage(
            content=[
                EmbeddedResourceContent(
                    uri="file:///tmp/readme.txt",
                    mime_type="text/plain",
                    text="Inline text",
                    blob=None,
                )
            ]
        )
    )
    message = cast(ChatCompletionUserMessageParam, builder.build()[0])
    assert message["content"] == "Inline text"


def test_openai_builder_user_message_unsupported_audio_falls_back():
    builder = OpenAIBuilder()
    builder.append(
        UserMessage(
            content=[AudioContent(data="ZGF0YQ==", mime_type="audio/ogg")]
        )
    )
    message = cast(ChatCompletionUserMessageParam, builder.build()[0])
    content = message["content"]
    assert isinstance(content, str)
    assert content.startswith("[audio]")


def test_openai_builder_agent_message_text_parts():
    builder = OpenAIBuilder()
    builder.append(
        AgentMessage(content=[TextContent(text="A"), TextContent(text="B")])
    )
    message = cast(ChatCompletionAssistantMessageParam, builder.build()[0])
    assert message["role"] == "assistant"
    parts = message.get("content")
    assert isinstance(parts, list)
    assert parts[0] == {"type": "text", "text": "A"}
    assert parts[1] == {"type": "text", "text": "B"}


def test_openai_builder_thoughts_config():
    builder = OpenAIBuilder(include_thoughts=False)
    builder.append(AgentThought(content=[TextContent(text="Hidden")]))
    assert builder.build() == []

    builder = OpenAIBuilder(thought_name=None)
    builder.append(AgentThought(content=[TextContent(text="Shown")]))
    message = cast(ChatCompletionAssistantMessageParam, builder.build()[0])
    assert "name" not in message


def test_openai_builder_tool_calls_config():
    builder = OpenAIBuilder(include_tool_calls=False)
    builder.append(
        ToolCall(
            tool_call_id="t2",
            title="ignored",
            kind="execute",
            content=[],
            status="completed",
        )
    )
    assert builder.build() == []


def test_openai_builder_tool_call_payloads():
    builder = OpenAIBuilder()
    tool_call = ToolCall(
        tool_call_id="t3",
        title="edit",
        kind="edit",
        status="completed",
        content=[
            TerminalToolCallContent(terminal_id="term2"),
            FileEditToolCallContent(
                diff=Diff(file_path=Path("a.txt"), old_text="a", new_text="b")
            ),
            ContentToolCallContent(content=TextContent(text="note")),
        ],
    )
    builder.append(tool_call)
    message = cast(ChatCompletionAssistantMessageParam, builder.build()[0])
    tool_calls = list(message.get("tool_calls", []))
    tool_call_param = tool_calls[0]
    assert tool_call_param["type"] == "custom"
    custom_call = tool_call_param
    payload = cast(dict[str, object], json.loads(custom_call["custom"]["input"]))
    items = cast(list[dict[str, object]], payload["content"])
    assert items[0]["type"] == "terminal"
    assert items[1]["type"] == "diff"
    path = cast(str, items[1]["path"])
    assert path.endswith("a.txt")
    assert items[2]["type"] == "content"
    assert items[2]["content"] == "note"


def test_openai_builder_tool_call_name_sanitize():
    builder = OpenAIBuilder()
    tool_call = ToolCall(
        tool_call_id="t4",
        title="run: git status",
        kind="execute",
        status="completed",
        content=[],
    )
    builder.append(tool_call)
    message = cast(ChatCompletionAssistantMessageParam, builder.build()[0])
    tool_calls = list(message.get("tool_calls", []))
    tool_call_param = tool_calls[0]
    assert tool_call_param["type"] == "custom"
    custom_call = tool_call_param
    name = custom_call["custom"]["name"]
    assert name == "run__git_status"


def test_openai_builder_ordering():
    builder = OpenAIBuilder()
    builder.extend(
        [
            UserMessage(content=[TextContent(text="U")]),
            AgentMessage(content=[TextContent(text="A")]),
        ]
    )
    messages = builder.build()
    assert [m["role"] for m in messages] == ["user", "assistant"]
