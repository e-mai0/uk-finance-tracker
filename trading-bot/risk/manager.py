"""Pre-trade risk checks and position sizing.

This is the most important file in the project. The strategy is a placeholder;
the risk manager is not. Its entire job is to guarantee that a bug, a bad
signal, or a bad day cannot blow up the account. Every order flows through it.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RiskLimits:
    max_position_pct: float = 0.10          # cap on a single symbol, as % of equity
    max_daily_loss_pct: float = 0.03        # halt trading after this loss vs day open
    kill_switch_drawdown_pct: float = 0.15  # halt everything past this drawdown vs peak


class RiskManager:
    def __init__(self, limits: RiskLimits, starting_equity: float) -> None:
        self._limits = limits
        self._high_water_mark = starting_equity
        self._day_start_equity = starting_equity

    def start_new_day(self, equity: float) -> None:
        """Reset the daily-loss reference. Call at the start of each session."""
        self._day_start_equity = equity

    def update_equity(self, equity: float) -> None:
        """Track the peak equity (high-water mark) for drawdown calculations."""
        self._high_water_mark = max(self._high_water_mark, equity)

    def kill_switch_triggered(self, equity: float) -> bool:
        return _pct_drop(self._high_water_mark, equity) >= self._limits.kill_switch_drawdown_pct

    def daily_loss_breached(self, equity: float) -> bool:
        return _pct_drop(self._day_start_equity, equity) >= self._limits.max_daily_loss_pct

    def can_trade(self, equity: float) -> tuple[bool, str]:
        """Gate checked before every evaluation pass."""
        if self.kill_switch_triggered(equity):
            return False, "kill-switch: max drawdown breached"
        if self.daily_loss_breached(equity):
            return False, "daily loss limit breached"
        return True, ""

    def position_size(self, equity: float, price: float, current_qty: float) -> float:
        """Whole-share quantity to buy to reach — but not exceed — the position cap.

        Returns 0 if the cap is already reached (or the price is invalid).
        """
        if price <= 0:
            return 0.0
        max_notional = equity * self._limits.max_position_pct
        room = max_notional - current_qty * price
        if room <= 0:
            return 0.0
        return float(int(room // price))


def _pct_drop(reference: float, current: float) -> float:
    """Fractional drop from `reference` to `current`, floored at 0."""
    if reference <= 0:
        return 0.0
    return max(0.0, (reference - current) / reference)
