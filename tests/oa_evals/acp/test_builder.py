from __future__ import annotations

import pytest
from acp.schema import (
    AgentMessageChunk,
    AgentThoughtChunk,
    TextContentBlock,
    ToolCallProgress,
    ToolCallStart,
    UserMessageChunk,
)

from oa_evals.acp.builder import MessageBuffer, ToolCallBuilder, TrajectoryBuilder
from oa_evals.acp.schema import (
    AgentMessage,
    AgentThought,
    TextContent,
    UserMessage,
)


class TestMessageBuffer:
    def test_buffer_operations(self):
        buffer = MessageBuffer(factory=UserMessage)

        # Test empty buffer
        assert buffer.peek() is None
        assert buffer.flush() is None

        # Test add and peek
        content = TextContent(text="Hello")
        buffer.add(content)
        peeked = buffer.peek()
        assert isinstance(peeked, UserMessage)
        assert peeked.content == [content]

        # Buffer should still have content
        assert len(buffer.chunks) == 1

        # Test flush
        flushed = buffer.flush()
        assert isinstance(flushed, UserMessage)
        assert flushed.content == [content]

        # Buffer should be empty after flush
        assert buffer.peek() is None
        assert len(buffer.chunks) == 0

    def test_buffer_multiple_chunks(self):
        buffer = MessageBuffer(factory=AgentMessage)
        c1 = TextContent(text="Part 1")
        c2 = TextContent(text="Part 2")

        buffer.add(c1)
        buffer.add(c2)

        result = buffer.flush()
        assert isinstance(result, AgentMessage)
        assert result.content == [c1, c2]


class TestToolCallBuilder:
    def test_lifecycle(self):
        start = ToolCallStart(
            tool_call_id="call_1",
            title="Test Tool",
            kind="execute",
            status="pending",
            content=[],
            session_update="tool_call",
        )

        builder = ToolCallBuilder.from_start(start)
        assert builder.tool_call_id == "call_1"
        assert builder.title == "Test Tool"
        assert builder.kind == "execute"
        assert not builder.is_complete

        # Progress update
        progress = ToolCallProgress(
            tool_call_id="call_1",
            status="in_progress",
            session_update="tool_call_update",
        )
        builder.apply(progress)
        assert builder.status == "in_progress"
        assert not builder.is_complete

        # Completion
        complete = ToolCallProgress(
            tool_call_id="call_1", status="completed", session_update="tool_call_update"
        )
        builder.apply(complete)
        assert builder.is_complete

        result = builder.build()
        assert result.tool_call_id == "call_1"
        assert result.status == "completed"

    def test_failed_tool_call(self):
        start = ToolCallStart(
            tool_call_id="call_2",
            title="Failing Tool",
            kind="execute",
            status="in_progress",
            content=[],
            session_update="tool_call",
        )
        builder = ToolCallBuilder.from_start(start)

        fail = ToolCallProgress(
            tool_call_id="call_2", status="failed", session_update="tool_call_update"
        )
        builder.apply(fail)
        assert builder.is_complete
        assert builder.status == "failed"


class TestTrajectoryBuilder:
    def test_simple_conversation(self):
        builder = TrajectoryBuilder()

        # User message
        chunk1 = UserMessageChunk(
            content=TextContentBlock(text="Hello", type="text"),
            session_update="user_message_chunk",
        )
        builder.append(chunk1)

        # Agent response
        chunk2 = AgentMessageChunk(
            content=TextContentBlock(text="Hi there", type="text"),
            session_update="agent_message_chunk",
        )
        builder.append(chunk2)

        traj = builder.build()
        assert len(traj.groups) == 1
        messages = traj.groups[0].messages
        assert len(messages) == 2
        assert isinstance(messages[0], UserMessage)
        assert isinstance(messages[1], AgentMessage)

    def test_message_buffering(self):
        builder = TrajectoryBuilder()

        # Two chunks for same message type
        chunk1 = UserMessageChunk(
            content=TextContentBlock(text="Part 1", type="text"),
            session_update="user_message_chunk",
        )
        chunk2 = UserMessageChunk(
            content=TextContentBlock(text="Part 2", type="text"),
            session_update="user_message_chunk",
        )

        builder.append(chunk1)
        builder.append(chunk2)

        # Switch to Agent thought
        chunk3 = AgentThoughtChunk(
            content=TextContentBlock(text="Thinking", type="text"),
            session_update="agent_thought_chunk",
        )
        builder.append(chunk3)

        traj = builder.build()
        messages = traj.groups[0].messages

        # Should combine user chunks into one message
        assert len(messages) == 2

        user_msg = messages[0]
        assert isinstance(user_msg, UserMessage)
        assert len(user_msg.content) == 2

        c1 = user_msg.content[0]
        assert isinstance(c1, TextContent)
        assert c1.text == "Part 1"

        c2 = user_msg.content[1]
        assert isinstance(c2, TextContent)
        assert c2.text == "Part 2"

        assert isinstance(messages[1], AgentThought)

    def test_tool_call_flow(self):
        builder = TrajectoryBuilder()

        # Initial thought
        builder.append(
            AgentThoughtChunk(
                content=TextContentBlock(text="I need to run a command", type="text"),
                session_update="agent_thought_chunk",
            )
        )

        # Tool call start
        builder.append(
            ToolCallStart(
                tool_call_id="t1",
                title="ls",
                kind="execute",
                status="in_progress",
                session_update="tool_call",
            )
        )

        # Tool call complete
        builder.append(
            ToolCallProgress(
                tool_call_id="t1", status="completed", session_update="tool_call_update"
            )
        )

        # Next cycle message
        builder.append(
            AgentMessageChunk(
                content=TextContentBlock(text="Done", type="text"),
                session_update="agent_message_chunk",
            )
        )

        traj = builder.build()

        # Should have two groups:
        # 1. Thought + ToolCall
        # 2. AgentMessage
        assert len(traj.groups) == 2

        group1 = traj.groups[0].messages
        assert len(group1) == 2
        assert isinstance(group1[0], AgentThought)

        from oa_evals.acp.schema import ToolCall

        assert isinstance(group1[1], ToolCall)
        assert group1[1].tool_call_id == "t1"

        group2 = traj.groups[1].messages
        assert len(group2) == 1
        assert isinstance(group2[0], AgentMessage)

    def test_build_data(self):
        builder = TrajectoryBuilder()
        updates = [
            UserMessageChunk(
                content=TextContentBlock(text="1", type="text"),
                session_update="user_message_chunk",
            ),
            AgentMessageChunk(
                content=TextContentBlock(text="2", type="text"),
                session_update="agent_message_chunk",
            ),
        ]

        for update in updates:
            builder.append(update)

        data = builder.build_data()
        assert len(data.updates) == 2
        assert data.updates == updates

    def test_build_from(self):
        updates = [
            UserMessageChunk(
                content=TextContentBlock(text="1", type="text"),
                session_update="user_message_chunk",
            ),
            AgentMessageChunk(
                content=TextContentBlock(text="2", type="text"),
                session_update="agent_message_chunk",
            ),
        ]
        traj = TrajectoryBuilder.build_from(updates)
        assert len(traj.groups) == 1
        assert len(traj.messages) == 2

    def test_unknown_tool_call_update(self):
        builder = TrajectoryBuilder()
        update = ToolCallProgress(
            tool_call_id="unknown_id",
            status="completed",
            session_update="tool_call_update",
        )
        with pytest.raises(
            ValueError, match="Received progress update for unknown tool call ID"
        ):
            builder.append(update)
