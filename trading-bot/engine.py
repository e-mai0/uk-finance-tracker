"""The trading loop: wire broker + strategy + risk together.

`run_once` performs a single evaluation pass and is safe to call on a schedule.
It is deliberately dumb: check risk gate -> check market open -> for each
symbol, get a signal, size it through risk, submit. All the judgement lives in
the strategy and risk modules.
"""

from __future__ import annotations

import logging

from broker.base import Broker
from models import OrderSide, Signal
from risk.manager import RiskManager
from strategy.base import Strategy

log = logging.getLogger("engine")


class TradingEngine:
    def __init__(
        self,
        broker: Broker,
        strategy: Strategy,
        risk: RiskManager,
        symbols: list[str],
    ) -> None:
        self._broker = broker
        self._strategy = strategy
        self._risk = risk
        self._symbols = symbols

    def run_once(self) -> None:
        account = self._broker.get_account()
        self._risk.update_equity(account.equity)

        ok, reason = self._risk.can_trade(account.equity)
        if not ok:
            log.warning("Trading halted: %s (equity=%.2f)", reason, account.equity)
            return

        if not self._broker.is_market_open():
            log.info("Market closed; skipping pass.")
            return

        for symbol in self._symbols:
            try:
                self._evaluate_symbol(symbol, account.equity)
            except Exception:
                # One bad symbol must never take down the whole loop.
                log.exception("Error evaluating %s", symbol)

    def _evaluate_symbol(self, symbol: str, equity: float) -> None:
        bars = self._broker.get_bars(symbol, self._strategy.lookback)
        signal = self._strategy.generate_signal(bars)
        position = self._broker.get_position(symbol)
        current_qty = position.qty if position else 0.0
        log.info("%s signal=%s held=%.4f", symbol, signal.value, current_qty)

        if signal is Signal.BUY:
            price = self._broker.get_latest_price(symbol)
            qty = self._risk.position_size(equity, price, current_qty)
            if qty <= 0:
                log.info("%s BUY skipped: position cap already reached", symbol)
                return
            order = self._broker.submit_market_order(symbol, qty, OrderSide.BUY)
            log.info("%s BUY %.4f submitted (order=%s)", symbol, qty, order.id)

        elif signal is Signal.SELL and current_qty > 0:
            # Exit the whole position. This starter never shorts.
            order = self._broker.submit_market_order(symbol, current_qty, OrderSide.SELL)
            log.info("%s SELL %.4f submitted (order=%s)", symbol, current_qty, order.id)
