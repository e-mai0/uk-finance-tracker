"""Alpaca implementation of the Broker interface.

Uses the official `alpaca-py` SDK. Defaults to the PAPER endpoint. This is the
ONLY file that imports anything Alpaca-specific — keep it that way, and adding
IBKR/OANDA later is a self-contained job.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest, StockLatestTradeRequest
from alpaca.data.timeframe import TimeFrame
from alpaca.trading.client import TradingClient
from alpaca.trading.enums import OrderSide as AlpacaOrderSide
from alpaca.trading.enums import TimeInForce
from alpaca.trading.requests import MarketOrderRequest

from broker.base import Broker
from models import Account, Bar, Order, OrderSide, Position


class AlpacaBroker(Broker):
    def __init__(self, api_key: str, secret_key: str, *, paper: bool = True) -> None:
        # Trading (orders/account) is paper-aware; market data is the same
        # endpoint for paper and live.
        self._trading = TradingClient(api_key, secret_key, paper=paper)
        self._data = StockHistoricalDataClient(api_key, secret_key)

    def get_account(self) -> Account:
        a = self._trading.get_account()
        return Account(
            equity=float(a.equity),
            cash=float(a.cash),
            buying_power=float(a.buying_power),
        )

    def get_position(self, symbol: str) -> Position | None:
        try:
            p = self._trading.get_open_position(symbol)
        except Exception:
            # Alpaca raises (404) when there is no open position. NOTE: this
            # also swallows genuine API/network errors — in production you'd
            # distinguish "flat" from "call failed" so a transient error can't
            # look like a flat book and trigger a re-entry.
            return None
        return Position(
            symbol=p.symbol,
            qty=float(p.qty),
            avg_entry_price=float(p.avg_entry_price),
            market_value=float(p.market_value),
        )

    def get_bars(self, symbol: str, limit: int) -> list[Bar]:
        # Request a window comfortably wider than `limit` daily bars (weekends
        # /holidays mean calendar days > trading days), then take the tail.
        start = datetime.now(timezone.utc) - timedelta(days=limit * 2 + 10)
        request = StockBarsRequest(
            symbol_or_symbols=symbol,
            timeframe=TimeFrame.Day,
            start=start,
        )
        barset = self._data.get_stock_bars(request)
        rows = barset.data.get(symbol, [])
        bars = [
            Bar(
                timestamp=b.timestamp,
                open=float(b.open),
                high=float(b.high),
                low=float(b.low),
                close=float(b.close),
                volume=float(b.volume),
            )
            for b in rows
        ]
        return bars[-limit:]

    def get_latest_price(self, symbol: str) -> float:
        request = StockLatestTradeRequest(symbol_or_symbols=symbol)
        latest = self._data.get_stock_latest_trade(request)
        return float(latest[symbol].price)

    def submit_market_order(self, symbol: str, qty: float, side: OrderSide) -> Order:
        order_data = MarketOrderRequest(
            symbol=symbol,
            qty=qty,
            side=AlpacaOrderSide.BUY if side is OrderSide.BUY else AlpacaOrderSide.SELL,
            time_in_force=TimeInForce.DAY,
        )
        o = self._trading.submit_order(order_data=order_data)
        return Order(
            id=str(o.id),
            symbol=o.symbol,
            qty=float(o.qty or qty),
            side=side,
            status=str(o.status),
        )

    def is_market_open(self) -> bool:
        return bool(self._trading.get_clock().is_open)
