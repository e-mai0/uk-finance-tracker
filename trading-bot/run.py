"""Entry point.

    python run.py --once   # single evaluation pass, then exit (great for testing)
    python run.py          # continuous loop, polling every POLL_SECONDS

Live trading is refused unless you explicitly opt in — see the guard below.
"""

from __future__ import annotations

import logging
import os
import sys
import time

from config import Config
from engine import TradingEngine
from risk.manager import RiskManager
from strategy.sma_crossover import SmaCrossover

# Optional: load a local .env if python-dotenv is installed. Never required.
try:  # pragma: no cover - convenience only
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover
    pass


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("run")

    cfg = Config.from_env()

    # Safety rail: refuse real-money trading unless explicitly acknowledged.
    if not cfg.paper and os.environ.get("ALLOW_LIVE", "").strip().lower() != "yes":
        raise SystemExit(
            "Refusing to trade LIVE. Keep ALPACA_PAPER=true (recommended), or set "
            "ALLOW_LIVE=yes only if you fully understand you are risking real money."
        )

    # Imported here so `--help`/config errors don't require alpaca-py installed.
    from broker.alpaca_broker import AlpacaBroker

    broker = AlpacaBroker(cfg.api_key, cfg.secret_key, paper=cfg.paper)
    account = broker.get_account()
    mode = "PAPER" if cfg.paper else "LIVE"
    log.info("Connected to Alpaca [%s] — equity=%.2f", mode, account.equity)

    strategy = SmaCrossover(fast=cfg.fast_period, slow=cfg.slow_period)
    risk = RiskManager(cfg.risk, starting_equity=account.equity)
    engine = TradingEngine(broker, strategy, risk, cfg.symbols)

    log.info(
        "Watching %s | SMA(%d/%d) | max_pos=%.0f%% daily_loss=%.0f%% kill=%.0f%%",
        ",".join(cfg.symbols),
        cfg.fast_period,
        cfg.slow_period,
        cfg.risk.max_position_pct * 100,
        cfg.risk.max_daily_loss_pct * 100,
        cfg.risk.kill_switch_drawdown_pct * 100,
    )

    if "--once" in sys.argv:
        engine.run_once()
        return

    try:
        while True:
            engine.run_once()
            time.sleep(cfg.poll_seconds)
    except KeyboardInterrupt:
        log.info("Interrupted — shutting down cleanly.")


if __name__ == "__main__":
    main()
