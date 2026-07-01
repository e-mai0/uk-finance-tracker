"""Shared domain types.

These are intentionally broker-agnostic. Strategy, risk, and engine code
depend on these dataclasses/enums — never on any vendor SDK type — so a new
broker adapter only has to translate its SDK objects into these.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class Signal(Enum):
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"


class OrderSide(Enum):
    BUY = "buy"
    SELL = "sell"


@dataclass(frozen=True)
class Bar:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(frozen=True)
class Position:
    symbol: str
    qty: float
    avg_entry_price: float
    market_value: float


@dataclass(frozen=True)
class Account:
    equity: float
    cash: float
    buying_power: float


@dataclass(frozen=True)
class Order:
    id: str
    symbol: str
    qty: float
    side: OrderSide
    status: str
