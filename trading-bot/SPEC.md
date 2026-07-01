# Trading Bot — System Specification

**Version:** 0.1 · **Status:** living document · **Owner:** you

This spec defines a systematic-trading **research → paper → (optionally, later)
live** system. It describes what exists today and what is planned, with
requirements written to be testable. It is also intended to be the substrate for
a "build prompt": a precise spec + acceptance criteria is what lets a capable
model produce a correct system in few shots. See [Appendix A](#appendix-a-using-this-spec-as-a-build-prompt).

> **Reality anchor.** This system's goal is **not** guaranteed profit. Markets
> are adversarial; no code or model manufactures an edge. The goal is a rigorous
> pipeline that lets you *find, validate, and safely deploy* an edge if one
> exists — and fail cheaply and honestly if it doesn't. Every requirement below
> serves that goal, especially the risk and validation sections.

---

## 1. Goals & non-goals

### 1.1 Goals
- **G1** — Express a strategy as a pure function of market data → trade intent,
  independent of any broker.
- **G2** — Run the *same* strategy code in backtest, paper, and live, so results
  transfer (no "backtest/live divergence").
- **G3** — Guarantee, structurally, that a bug or bad signal cannot blow up the
  account: centralized, always-on risk controls.
- **G4** — Validate strategies honestly: realistic costs, strict out-of-sample
  testing, explicit overfitting guardrails.
- **G5** — Run for free during development (paper accounts, free data tiers) and
  on macOS/Linux with no Windows-only dependencies.

### 1.2 Non-goals
- **N1** — Not a profit guarantee or "money printer."
- **N2** — Not low-latency / HFT. Decision cadence is seconds-to-daily, not
  microseconds.
- **N3** — Not discretionary/manual trading; not a charting UI.
- **N4** — Not portfolio/net-worth tracking — that is the separate
  `uk-finance-tracker` app. This project shares no code with it.
- **N5** — Not tax, accounting, or regulatory advice.

---

## 2. Design principles

1. **Broker-agnostic core.** Strategy, risk, and engine code depend only on
   `models` types and the `Broker` interface — never on a vendor SDK. Adding a
   venue is one new adapter.
2. **Risk is non-negotiable and centralized.** Every order flows through one
   `RiskManager`. There is no code path that submits an order without passing a
   risk gate.
3. **Backtest/live parity.** The historical simulator and the live engine drive
   the *same* `Strategy` and `RiskManager`. A strategy cannot behave differently
   in test vs production.
4. **No look-ahead, ever.** At decision time for bar *t*, only information
   available at the close of bar *t* (or earlier) may be used.
5. **Fail honestly.** If a strategy has no edge after realistic testing, the
   system reports that. Tuning parameters until the backtest looks good is
   treated as the overfitting failure mode it is, not a success.
6. **Offline-testable.** Core logic (strategy math, risk rules, cost model,
   backtester) is unit-testable with no network and no API keys.
7. **Safe by default.** Paper is the default. Live requires explicit,
   double-gated opt-in.

---

## 3. Architecture

```
                 ┌───────────────────────────────────────────────┐
                 │                   Engine                        │
                 │   (orchestration: run_once / loop / schedule)   │
                 └───────────────────────────────────────────────┘
                        │            │             │
             get_bars   ▼            ▼ signal      ▼ size + gate
        ┌──────────────────┐  ┌────────────┐  ┌──────────────┐
        │   Broker (iface) │  │  Strategy  │  │ RiskManager  │
        │  Alpaca | IBKR…  │  │ (iface)    │  │              │
        └──────────────────┘  └────────────┘  └──────────────┘
                 ▲  submit_market_order                │
                 └─────────────────────────────────────┘

   Backtester  ── drives the SAME Strategy + RiskManager against historical
                  bars through a Cost Model, producing Metrics/Reports.
```

- **`models`** — broker-agnostic domain types (`Bar`, `Position`, `Account`,
  `Order`, `Signal`, `OrderSide`). The lingua franca of the system.
- **`Broker`** (interface) — the venue seam. Adapters translate SDK objects into
  `models` types. Alpaca adapter exists today.
- **`Strategy`** (interface) — `bars → Signal`. Pure, stateless w.r.t. the venue.
- **`RiskManager`** — pre-trade gate + position sizing.
- **`Engine`** — wires the above into an evaluation pass.
- **`Backtester`** *(planned)* — replays historical bars through Strategy + Risk
  + Cost Model.
- **`Data`** *(planned as a first-class layer)* — point-in-time history for
  backtests; live bars currently come through the Broker adapter.

---

## 4. Functional requirements

Legend: **[DONE]** implemented & unit-tested · **[PARTIAL]** exists, gaps noted ·
**[PLANNED]** not yet built.

### 4.1 Domain model (`MDL`)
- **MDL-1 [DONE]** All cross-component data uses immutable `models` dataclasses/enums.
- **MDL-2 [DONE]** No `models` type imports a vendor SDK.

### 4.2 Broker / execution (`EXE`)
- **EXE-1 [DONE]** `Broker` interface exposes: `get_account`, `get_position`,
  `get_bars`, `get_latest_price`, `submit_market_order`, `is_market_open`.
- **EXE-2 [DONE]** Alpaca adapter implements `Broker` via `alpaca-py`, defaulting
  to the paper endpoint.
- **EXE-3 [DONE]** The Alpaca SDK is imported in exactly one file
  (`broker/alpaca_broker.py`).
- **EXE-4 [PLANNED]** Order lifecycle beyond submission: poll fill status, handle
  partial fills, cancel/replace, reconcile open orders on startup.
- **EXE-5 [PLANNED]** Limit and bracket order support (currently market-only).
- **EXE-6 [PARTIAL]** `get_position` returns `None` when flat, but currently also
  swallows API/network errors as "flat." Must distinguish *flat* from *call
  failed* so a transient error cannot trigger an unintended re-entry.
- **EXE-7 [PLANNED]** At least one second adapter (IBKR or OANDA) to prove the
  seam holds.

### 4.3 Strategy (`STR`)
- **STR-1 [DONE]** `Strategy` interface: `lookback: int` and
  `generate_signal(bars) -> Signal`.
- **STR-2 [DONE]** Strategies return `HOLD` when given fewer than `lookback` bars.
- **STR-3 [DONE]** Example `SmaCrossover` provided and clearly labeled a
  non-edge placeholder.
- **STR-4 [DONE]** Strategies import no broker/SDK code.
- **STR-5 [PLANNED]** Strategy may carry parameters that the validation harness
  can sweep; parameter count is reported (overfitting signal).

### 4.4 Risk management (`RSK`)
- **RSK-1 [DONE]** Per-symbol position cap as a fraction of equity
  (`max_position_pct`).
- **RSK-2 [DONE]** Daily-loss halt vs day-open equity (`max_daily_loss_pct`).
- **RSK-3 [DONE]** Drawdown kill-switch vs high-water mark
  (`kill_switch_drawdown_pct`).
- **RSK-4 [DONE]** `position_size` never exceeds the cap, accounts for existing
  holdings, and returns 0 on invalid price.
- **RSK-5 [DONE]** Every order in the engine passes through `RiskManager`.
- **RSK-6 [PLANNED]** Portfolio-level limits: max gross exposure, max open
  positions, max per-sector/correlated exposure.
- **RSK-7 [PLANNED]** Alternative sizing methods: fixed-fractional (done),
  volatility-targeting, ATR-based stops.
- **RSK-8 [PLANNED]** Idempotent halt persistence: once the kill-switch fires,
  stay halted across process restarts until manually cleared.

### 4.5 Engine / orchestration (`ENG`)
- **ENG-1 [DONE]** `run_once()` performs one pass: update equity → risk gate →
  market-open check → per-symbol evaluate.
- **ENG-2 [DONE]** A failure on one symbol is logged and does not abort the pass.
- **ENG-3 [DONE]** Continuous loop with configurable poll interval; `--once` mode
  for testing.
- **ENG-4 [PLANNED]** Market-hours-aware scheduling (don't poll uselessly when
  closed; align to bar boundaries).
- **ENG-5 [PLANNED]** State persistence: positions/PnL/halt-state survive
  restarts; reconcile against broker truth on boot.
- **ENG-6 [PLANNED]** Graceful degradation + retry/backoff on transient broker
  or data errors; structured alerting on repeated failure.

### 4.6 Backtesting (`BKT`) — *planned, the priority next milestone*
- **BKT-1 [PLANNED]** Replay historical bars through the *same* `Strategy` and
  `RiskManager` used live (parity).
- **BKT-2 [PLANNED]** Enforce no look-ahead: at bar *t*, only data ≤ *t* is
  visible to the strategy.
- **BKT-3 [PLANNED]** Cost model applied to every simulated fill (see §6).
- **BKT-4 [PLANNED]** Deterministic and reproducible: same inputs → same output.
- **BKT-5 [PLANNED]** Produce a trade log and an equity curve.

### 4.7 Validation (`VAL`) — *planned*
- **VAL-1 [PLANNED]** In-sample / out-of-sample split with a strict boundary.
- **VAL-2 [PLANNED]** Walk-forward analysis (rolling re-fit → forward test).
- **VAL-3 [PLANNED]** Report IS-vs-OOS degradation explicitly.
- **VAL-4 [PLANNED]** Metrics: total/annualized return, Sharpe, Sortino, max
  drawdown, Calmar, hit rate, avg win/loss, turnover, exposure — each with an OOS
  variant.
- **VAL-5 [PLANNED]** Overfitting guardrails: flag high parameter counts,
  suspiciously smooth equity curves, and large IS→OOS drop-offs.
- **VAL-6 [PLANNED]** Require a written **kill-criteria** note per strategy before
  it may be promoted to paper/live.

### 4.8 Data (`DAT`)
- **DAT-1 [PARTIAL]** Live/recent daily bars are fetched via the Broker adapter.
- **DAT-2 [PLANNED]** First-class historical data ingestion for backtests, stored
  point-in-time (as-of correct; no survivorship/restatement leakage).
- **DAT-3 [PLANNED]** Pluggable data sources behind an interface (Alpaca data,
  vendor CSVs, etc.), mirroring the Broker seam.

### 4.9 Configuration & secrets (`CFG`)
- **CFG-1 [DONE]** All configuration comes from environment variables; `.env`
  supported via optional `python-dotenv`.
- **CFG-2 [DONE]** Missing credentials fail fast with a clear message.
- **CFG-3 [DONE]** Secrets are never committed (`.env` gitignored; only
  `.env.example` tracked).

### 4.10 Observability (`OBS`)
- **OBS-1 [DONE]** Structured, timestamped logging of signals, sizing decisions,
  submissions, and halts.
- **OBS-2 [PLANNED]** Persist a durable trade/decision journal (file or DB).
- **OBS-3 [PLANNED]** Alerting (e.g., on halt, on repeated errors) via a
  notification channel.

### 4.11 Interface (`CLI`)
- **CLI-1 [DONE]** `python run.py --once` (single pass) and `python run.py`
  (loop).
- **CLI-2 [PLANNED]** `backtest` and `validate` subcommands.

---

## 5. Non-functional requirements

- **NFR-Safety** — Paper is default. Live is refused unless `ALPACA_PAPER=false`
  **and** `ALLOW_LIVE=yes`. The kill-switch is always active.
- **NFR-Correctness** — No look-ahead (BKT-2); backtest/live parity (BKT-1).
- **NFR-Portability** — Runs on macOS and Linux, Python 3.11+. No Windows-only
  or GUI-terminal dependencies.
- **NFR-Testability** — Core logic is unit-tested offline; current suite is
  green (strategy + all risk rules).
- **NFR-Cost** — Development is free: paper brokerage + free data tiers.
- **NFR-Security** — Keys only via env; never logged; never written to disk by
  the app.
- **NFR-Reliability** — Transient failures isolated per symbol today; full
  retry/reconnect/state-recovery is planned (ENG-5/6).

---

## 6. Cost & execution model (the requirement people skip)

A strategy is **not** "profitable" until it survives realistic costs. The
backtester (BKT-3) must model, per fill:

- **Commission** — configurable per-share/per-trade/percentage. (Alpaca US
  equities are commission-free, but this must remain configurable for other
  venues/assets.)
- **Spread** — buy at ask, sell at bid; configurable half-spread.
- **Slippage** — configurable model (fixed bps and/or volume-participation).

**Paper-trading caveat (must be documented wherever results are shown):** paper
fills are optimistic — no real slippage, perfect liquidity, no partial fills.
Paper validates *code correctness*, not *strategy profitability*. Only backtests
with the cost model above, and eventually small real-money tests, speak to
profitability.

---

## 7. Data model & interfaces (reference)

**Domain types** (`models.py`): `Signal{BUY,SELL,HOLD}`, `OrderSide{BUY,SELL}`,
`Bar`, `Position`, `Account`, `Order`.

**`Broker`** — `get_account() -> Account`, `get_position(symbol) -> Position|None`,
`get_bars(symbol, limit) -> list[Bar]`, `get_latest_price(symbol) -> float`,
`submit_market_order(symbol, qty, side) -> Order`, `is_market_open() -> bool`.

**`Strategy`** — `lookback: int`, `generate_signal(bars) -> Signal`.

**`RiskManager`** — `update_equity`, `start_new_day`, `can_trade(equity) ->
(bool, reason)`, `position_size(equity, price, current_qty) -> qty`, plus the
individual predicates (`kill_switch_triggered`, `daily_loss_breached`).

**Config (env)** — `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `ALPACA_PAPER`,
`ALLOW_LIVE`, `SYMBOLS`, `FAST_PERIOD`, `SLOW_PERIOD`, `POLL_SECONDS`,
`MAX_POSITION_PCT`, `MAX_DAILY_LOSS_PCT`, `KILL_SWITCH_DRAWDOWN_PCT`.

---

## 8. Testing strategy

- **Unit (offline)** — strategy math, risk rules, and (planned) the cost model
  and backtester. No network, no keys. *Current: 12 tests passing.*
- **Integration (paper)** — end-to-end pass against a real paper account;
  asserts a full loop submits and reflects orders.
- **Backtest reproducibility** — identical inputs produce identical trade logs
  and metrics.

**Acceptance gate for any new strategy before promotion:** unit tests green →
backtest with cost model → walk-forward with acceptable IS→OOS degradation →
written kill criteria → paper run → (only then) consider live.

---

## 9. Roadmap

| Milestone | Scope | Status |
|---|---|---|
| **M0 — Scaffold** | Broker seam, Alpaca paper adapter, strategy + risk + engine, tests | ✅ Done |
| **M1 — Backtester + cost model** | BKT-1..5, §6 costs, trade log + equity curve | ▶ Next |
| **M2 — Validation & metrics** | VAL-1..6, reporting | Planned |
| **M3 — Robust paper runtime** | ENG-4/5/6, OBS-2/3, EXE-4/6 | Planned |
| **M4 — Second broker adapter** | EXE-7 (IBKR or OANDA), DAT-3 | Planned |
| **M5 — Live readiness (gated)** | Live checklist, RSK-6/8, reconciliation | Optional |

---

## 10. Open decisions (need your input)

1. **Asset class & venue focus** — US equities via Alpaca (current), or add
   FX (OANDA/cTrader) / crypto (testnets)? Drives data + cost model.
2. **Timeframe** — daily bars (current default) vs intraday? Affects data volume,
   scheduling, and cost sensitivity.
3. **Backtest data source** — Alpaca historical, or a vendor CSV/parquet dataset?
4. **Persistence** — flat files vs SQLite for the trade journal and halt-state.
5. **Deployment** — run locally on your Mac during dev; a small always-on VPS for
   continuous paper later?

---

## Appendix A — Using this spec as a build prompt

Your original aim was to "engineer the perfect prompt so it can one-shot a
perfect system." This spec is 80% of that prompt. To turn it into a build prompt:

1. **Prepend a role + mandate:** "Build the system specified below. Reject any
   framing that assumes guaranteed profit."
2. **Attach acceptance criteria:** the `[DONE]`/`[PLANNED]` requirement IDs
   become a checklist the output must satisfy, and §8 becomes the test gate.
3. **Foreground the guardrails:** §2 principles, §6 cost model, and §4.7
   validation are the instructions that separate a real system from a
   plausible-looking one — a model omits these unless told not to.
4. **Constrain scope per milestone:** ask for one milestone at a time (M1 next),
   not the whole system in one shot — smaller, verifiable deltas beat a big
   unverifiable dump, regardless of how capable the model is.

The lever was never a smarter model; it was pinning down *these* requirements.
Want me to generate the M1 (backtester) build prompt from this spec, or just
build M1 directly?
