from __future__ import annotations

from abc import ABC

from pydantic import BaseModel, RootModel


class OutcomeData(BaseModel, ABC):
    """
    The outcome is the final state in the environment at the end of the trial.

    e.g. A flight-booking agent might say “Your flight has been booked” at the end of the transcript, but the outcome is whether a reservation exists in the environment's SQL database.
    """


class OutcomeValue(OutcomeData, RootModel):
    """A convenient wrapper for a single outcome value."""

    @classmethod
    def ensure(cls, value: object) -> OutcomeData:
        match value:
            case OutcomeData():
                return value
            case _:
                return cls(root=value)
