from __future__ import annotations

from .abc import GraderProtocol
from .model import OutcomeData

GradeResult = dict[str, OutcomeData]
GraderRegistry = dict[str, GraderProtocol]
