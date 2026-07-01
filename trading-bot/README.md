# trading-bot

A small, honest **paper-trading** bot for [Alpaca](https://alpaca.markets/), built
behind a broker-agnostic interface so you can swap in IBKR / OANDA / cTrader
later without touching your strategy code.

> ⚠️ **Read this first.** This is a *scaffold*, not a money machine. The bundled
> strategy (an SMA crossover) is a deliberate placeholder that will **not** make
> money — it exists only to prove the full loop works end-to-end on a paper
> account. Paper accounts also fill too optimistically (no real slippage,
> perfect liquidity), so treat paper results as a test of *your code*, never of
> *a strategy's profitability*. Real edges are hard; risk controls are what keep
> you solvent while you look for one.

## What's here

```
trading-bot/
├── models.py              # broker-agnostic domain types (Bar, Order, Signal, ...)
├── broker/
│   ├── base.py            # the Broker interface everything depends on
│   └── alpaca_broker.py   # the ONLY Alpaca-specific file (alpaca-py SDK)
├── strategy/
│   ├── base.py            # Strategy interface: bars -> BUY/SELL/HOLD
│   └── sma_crossover.py   # example placeholder strategy
├── risk/
│   └── manager.py         # position sizing + daily-loss + drawdown kill-switch
├── engine.py              # the loop: risk gate -> signal -> size -> submit
├── config.py              # env-var config
├── run.py                 # entry point (python run.py [--once])
└── tests/                 # pure-logic unit tests (no network / no keys)
```

The design point: **strategy and engine never import an SDK.** They speak only
`models` + the `Broker` interface. Adding a new venue = writing one new adapter
in `broker/`.

## Setup

```bash
cd trading-bot
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # add -dev for the test suite
```

Get **paper** API keys from the Alpaca paper dashboard
(https://app.alpaca.markets/paper/dashboard/overview → *Generate New Keys*), then:

```bash
cp .env.example .env
# paste ALPACA_API_KEY / ALPACA_SECRET_KEY into .env  (keep ALPACA_PAPER=true)
```

## Run

```bash
python run.py --once     # one evaluation pass, then exit — use this first
python run.py            # continuous loop, polling every POLL_SECONDS
```

Live trading is refused unless you set `ALPACA_PAPER=false` **and** `ALLOW_LIVE=yes`.
Don't, until you've paper-traded for a long time and know exactly why you're doing it.

## Test

```bash
pip install -r requirements-dev.txt
python -m pytest          # run from the trading-bot/ directory
```

The tests cover the strategy math and every risk rule (position cap, daily-loss
halt, drawdown kill-switch) with no network calls or API keys required.

## Extending it

**New strategy** — subclass `Strategy`, implement `lookback` and
`generate_signal(bars) -> Signal`, and swap it into `run.py`. The rest of the
system is untouched.

**New broker** — subclass `Broker` in `broker/`, implement the six methods by
translating that venue's SDK objects into `models` types, and construct it in
`run.py`. Strategy, risk, and engine code don't change.

## Honest next steps (what actually matters)

1. **Backtest before live paper.** A paper loop tells you the plumbing works; a
   backtest with a realistic cost model (commission + spread + slippage) tells
   you whether an idea has any chance. Add this next.
2. **Walk-forward validation.** Keep strict out-of-sample data. Report in-sample
   vs out-of-sample degradation and treat parameter-tuning-until-it-looks-good
   as the overfitting trap it is.
3. **Write down kill criteria** — the conditions under which you stop trading a
   strategy — *before* you deploy it.
