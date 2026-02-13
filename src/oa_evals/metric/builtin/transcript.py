from __future__ import annotations

from oa_evals.acp import (
    AgentMessage,
    AgentThought,
    ToolCall,
    Trajectory,
    UserMessage,
)
from oa_evals.acp.schema import TextContent
from oa_evals.metric import MetricValue


async def turns_metric(traj: Trajectory) -> MetricValue[int]:
    """Total number of agent turns (AgentMessage) in the trajectory."""
    n_turns = sum(1 for msg in traj.messages if isinstance(msg, AgentMessage))
    return MetricValue(root=n_turns)


async def tool_calls_metric(traj: Trajectory) -> MetricValue[int]:
    """Total number of tool calls in the trajectory."""
    n_toolcalls = sum(1 for msg in traj.messages if isinstance(msg, ToolCall))
    return MetricValue(root=n_toolcalls)


async def total_tokens_metric(traj: Trajectory) -> MetricValue[int]:
    """Total number of tokens in the trajectory (approximated by characters)."""
    total_chars = 0
    for msg in traj.messages:
        match msg:
            case AgentMessage() | UserMessage() | AgentThought():
                total_chars += sum(
                    len(block.text)
                    for block in msg.content
                    if isinstance(block, TextContent)
                )

    # Simple heuristic: 1 token ≈ 4 characters
    return MetricValue(root=total_chars // 4)
