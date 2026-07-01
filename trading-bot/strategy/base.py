"""Strategy interface.

A strategy is a pure function of recent bars -> Signal. It knows nothing about
the broker, order sizing, or risk. That separation is deliberate: strategy code
is where bugs are cheap; risk/execution code is where they are expensive.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from models import Bar, Signal


class Strategy(ABC):
    @property
    @abstractmethod
    def lookback(self) -> int:
        """How many bars `generate_signal` needs to produce a real signal."""

    @abstractmethod
    def generate_signal(self, bars: list[Bar]) -> Signal:
        """Return BUY / SELL / HOLD given the most recent bars (oldest first)."""
