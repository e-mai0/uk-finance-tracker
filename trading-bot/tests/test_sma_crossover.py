"""Pure-logic tests for the example strategy. No network, no API keys."""

from datetime import datetime, timezone

from models import Bar, Signal
from strategy.sma_crossover import SmaCrossover


def _bars(closes: list[float]) -> list[Bar]:
    ts = datetime(2024, 1, 1, tzinfo=timezone.utc)
    return [Bar(timestamp=ts, open=c, high=c, low=c, close=c, volume=1.0) for c in closes]


def test_holds_without_enough_bars():
    s = SmaCrossover(fast=2, slow=3)  # needs 4 bars
    assert s.generate_signal(_bars([10, 10, 10])) is Signal.HOLD


def test_buy_on_upward_cross():
    s = SmaCrossover(fast=2, slow=3)
    # fast/slow equal on prev bar, fast jumps above slow on the last bar.
    assert s.generate_signal(_bars([10, 10, 10, 16])) is Signal.BUY


def test_sell_on_downward_cross():
    s = SmaCrossover(fast=2, slow=3)
    assert s.generate_signal(_bars([10, 10, 10, 4])) is Signal.SELL


def test_hold_when_no_cross():
    s = SmaCrossover(fast=2, slow=3)
    # fast stays above slow throughout a steady uptrend — no crossing event.
    assert s.generate_signal(_bars([10, 11, 12, 13])) is Signal.HOLD


def test_rejects_bad_periods():
    import pytest

    with pytest.raises(ValueError):
        SmaCrossover(fast=50, slow=20)
