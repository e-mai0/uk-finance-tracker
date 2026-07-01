"""Example strategy: fast/slow simple-moving-average crossover.

⚠️  THIS IS A PLACEHOLDER TO PROVE THE PLUMBING — NOT AN EDGE.
SMA crossovers are among the most well-known, most-arbitraged signals in
existence and almost never survive real transaction costs and slippage.
Its job here is only to make the engine emit BUY/SELL so you can watch the
full loop work on a paper account. Replace it with your own hypothesis;
keep the risk manager no matter what.
"""

from __future__ import annotations

from models import Bar, Signal
from strategy.base import Strategy


class SmaCrossover(Strategy):
    def __init__(self, fast: int = 20, slow: int = 50) -> None:
        if fast >= slow:
            raise ValueError("fast period must be strictly less than slow period")
        self.fast = fast
        self.slow = slow

    @property
    def lookback(self) -> int:
        # +1 so we can compare the current bar's cross state against the prior.
        return self.slow + 1

    def generate_signal(self, bars: list[Bar]) -> Signal:
        if len(bars) < self.lookback:
            return Signal.HOLD

        closes = [b.close for b in bars]
        fast_now = _sma(closes, self.fast, offset=0)
        slow_now = _sma(closes, self.slow, offset=0)
        fast_prev = _sma(closes, self.fast, offset=1)
        slow_prev = _sma(closes, self.slow, offset=1)

        crossed_up = fast_prev <= slow_prev and fast_now > slow_now
        crossed_down = fast_prev >= slow_prev and fast_now < slow_now

        if crossed_up:
            return Signal.BUY
        if crossed_down:
            return Signal.SELL
        return Signal.HOLD


def _sma(closes: list[float], period: int, offset: int) -> float:
    """Simple moving average of `period` closes ending `offset` bars from the end."""
    end = len(closes) - offset
    window = closes[end - period : end]
    return sum(window) / len(window)
