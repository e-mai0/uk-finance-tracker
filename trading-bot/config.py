"""Configuration loaded from environment variables (see .env.example)."""

from __future__ import annotations

import os
from dataclasses import dataclass

from risk.manager import RiskLimits


@dataclass
class Config:
    api_key: str
    secret_key: str
    paper: bool
    symbols: list[str]
    fast_period: int
    slow_period: int
    poll_seconds: int
    risk: RiskLimits

    @staticmethod
    def from_env() -> "Config":
        api_key = os.environ.get("ALPACA_API_KEY", "").strip()
        secret_key = os.environ.get("ALPACA_SECRET_KEY", "").strip()
        if not api_key or not secret_key:
            raise SystemExit(
                "Missing credentials. Set ALPACA_API_KEY and ALPACA_SECRET_KEY "
                "(copy .env.example to .env and paste your PAPER keys)."
            )

        symbols = [
            s.strip().upper()
            for s in os.environ.get("SYMBOLS", "AAPL,MSFT,SPY").split(",")
            if s.strip()
        ]

        return Config(
            api_key=api_key,
            secret_key=secret_key,
            paper=_env_bool("ALPACA_PAPER", default=True),
            symbols=symbols,
            fast_period=int(os.environ.get("FAST_PERIOD", "20")),
            slow_period=int(os.environ.get("SLOW_PERIOD", "50")),
            poll_seconds=int(os.environ.get("POLL_SECONDS", "60")),
            risk=RiskLimits(
                max_position_pct=float(os.environ.get("MAX_POSITION_PCT", "0.10")),
                max_daily_loss_pct=float(os.environ.get("MAX_DAILY_LOSS_PCT", "0.03")),
                kill_switch_drawdown_pct=float(os.environ.get("KILL_SWITCH_DRAWDOWN_PCT", "0.15")),
            ),
        )


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}
