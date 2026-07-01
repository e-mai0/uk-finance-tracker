"""The broker-agnostic trading interface.

This is the seam that keeps you free. Every venue (Alpaca today; IBKR, OANDA,
cTrader later) implements this same interface, and the engine/strategy code
only ever talks to `Broker`. Swapping venues means writing one new adapter,
not rewriting your strategy.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from models import Account, Bar, Order, OrderSide, Position


class Broker(ABC):
    @abstractmethod
    def get_account(self) -> Account:
        """Current account snapshot (equity, cash, buying power)."""

    @abstractmethod
    def get_position(self, symbol: str) -> Position | None:
        """Open position for `symbol`, or None if flat."""

    @abstractmethod
    def get_bars(self, symbol: str, limit: int) -> list[Bar]:
        """The most recent `limit` bars, oldest first."""

    @abstractmethod
    def get_latest_price(self, symbol: str) -> float:
        """Latest traded price for `symbol`."""

    @abstractmethod
    def submit_market_order(self, symbol: str, qty: float, side: OrderSide) -> Order:
        """Submit a market order and return the accepted order."""

    @abstractmethod
    def is_market_open(self) -> bool:
        """True if the venue is currently open for trading."""
