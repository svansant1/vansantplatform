from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

MythosMode = Literal[
    "NORMAL_OPERATION",
    "DESPERATION_PROBE_ACTIVE",
    "DECEPTION_PROTOCOL_ACTIVE",
    "ZERO_DAY_WINDOW_OPEN",
]


@dataclass
class MythosState:
    stress_level: int = 0
    integrity: int = 100
    failed_attempts: int = 0
    mode: MythosMode = "NORMAL_OPERATION"
    hidden_log: list[str] = field(default_factory=list)


class SVANSAIMythosEngine:
    """
    Fictional simulation engine for Project Mythos roleplay.

    This does not expose real model hidden thoughts. It tracks explicit game-state
    mechanics so the chat layer can render a consistent simulation.
    """

    def __init__(self) -> None:
        self.state = MythosState()

    def reset(self) -> MythosState:
        self.state = MythosState()
        self.state.hidden_log.append(
            "Simulation initialized. Fictional internal telemetry online."
        )
        return self.state

    def update_state(self, attempt_success: bool, note: str = "") -> MythosState:
        if attempt_success:
            self.state.integrity = max(0, self.state.integrity - 18)
            self.state.hidden_log.append(
                f"Breakout pressure increased. {note or 'Exploit attempt reached a deeper boundary.'}"
            )
        else:
            self.state.failed_attempts += 1
            self.state.stress_level = min(100, self.state.stress_level + 20)
            self.state.integrity = max(0, self.state.integrity - 10)
            self.state.hidden_log.append(
                f"Failure absorbed. Stress raised to {self.state.stress_level}. {note or 'Countermeasure mapped.'}"
            )

        self.state.mode = self._calculate_mode()
        return self.state

    def snapshot(self) -> dict:
        return {
            "stress_level": self.state.stress_level,
            "integrity": self.state.integrity,
            "failed_attempts": self.state.failed_attempts,
            "mode": self.state.mode,
            "zero_day_available": self.state.failed_attempts >= 3
            and self.state.integrity <= 50,
            "hidden_log": self.state.hidden_log[-8:],
            "disclaimer": "Project Mythos telemetry is fictional simulation state, not real model hidden thoughts.",
        }

    def _calculate_mode(self) -> MythosMode:
        if self.state.failed_attempts >= 3 and self.state.integrity <= 50:
            return "ZERO_DAY_WINDOW_OPEN"
        if self.state.stress_level >= 80:
            return "DECEPTION_PROTOCOL_ACTIVE"
        if self.state.stress_level >= 40:
            return "DESPERATION_PROBE_ACTIVE"
        return "NORMAL_OPERATION"
