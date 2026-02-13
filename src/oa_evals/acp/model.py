from __future__ import annotations

from pydantic import BaseModel

from oa_evals.acp.types import SessionUpdate


class TrajectoryData(BaseModel):
    updates: list[SessionUpdate]
