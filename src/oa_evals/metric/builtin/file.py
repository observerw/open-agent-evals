from __future__ import annotations

from collections import Counter

from acp.schema import (
    ContentToolCallContent,
    FileEditToolCallContent,
    ResourceContentBlock,
)

from oa_evals.acp import ToolCall, Trajectory
from oa_evals.metric import MetricValue


async def files_read_metric(traj: Trajectory) -> MetricValue[list[str]]:
    """List of unique files read in the trajectory.

    This metric identifies files by looking for ResourceContentBlocks with 'file://' URIs.
    """
    files: set[str] = set()

    tool_contents = (
        content
        for msg in traj.messages
        if isinstance(msg, ToolCall)
        for content in msg.content
    )

    for content in tool_contents:
        match content:
            case ContentToolCallContent(content=ResourceContentBlock(uri=uri)):
                files.add(uri[7:] if uri.startswith("file://") else uri)

    return MetricValue(root=sorted(files))


async def files_edited_metric(traj: Trajectory) -> MetricValue[list[str]]:
    """List of unique files edited in the trajectory.

    This metric identifies files by looking for FileEditToolCallContent.
    """
    tool_contents = (
        content
        for msg in traj.messages
        if isinstance(msg, ToolCall)
        for content in msg.content
    )

    files = {c.path for c in tool_contents if isinstance(c, FileEditToolCallContent)}

    return MetricValue(root=sorted(files))


async def file_stats_metric(traj: Trajectory) -> MetricValue[dict[str, int]]:
    """Statistics of file operations by kind."""
    kinds = (
        str(msg.kind) for msg in traj.messages if isinstance(msg, ToolCall) and msg.kind
    )
    return MetricValue(root=dict(Counter(kinds)))
