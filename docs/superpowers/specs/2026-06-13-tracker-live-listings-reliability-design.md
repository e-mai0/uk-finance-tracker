# Tracker live-listings reliability — design

**Date:** 2026-06-13
**Status:** Draft for review
**Outcome:** The tracker accurately reflects *live* listings — real open roles, with accurate open/close status and trustworthy deadlines — instead of firms standing in as generic careers-page links with stale or absent dates.

---

## Problem

The ingestion *research* (`src/ingestion/source-plans/uk-finance-2027.json`) covers ~25 firms with evidence-backed extraction plans, but the *implementation* only publishes live roles for **3 firms**:

- **Man Group**, **Point72** — Greenhouse public API (`greenhouse.ts`)
- **Jane Street** — its own JSON feed (`janestreet.ts`)

Everything else is either:

- **Seeded as `watchOnly`** (Goldman Sachs, BlackRock, Deutsche Bank, Citadel, Citadel Securities) — change-detection only, never publishes roles. Renders as a firm with a careers-page link and nothing live behind it. **This is the "generic careers page" symptom.**
- **Not wired in at all** (Morgan Stanley, Barclays, Blackstone, J.P. Morgan, Schroders, Citi, HSBC, UBS, Macquarie, BofA, Nomura, Jefferies, Rothschild, Evercore, Lazard, Fidelity). `sync.ts → adapterFor()` only handles `GREENHOUSE | LEVER | ASHBY | CAREERS_PAGE`; `WorkdayAdapter` is a stub that throws.

**Deadlines are inaccurate** because `deadlineAt` is only ever populated from JSON-LD `validThrough` (`jsonld.ts`), and no live source uses that path. Greenhouse — the only working role feed — exposes no deadline, so live roles carry `deadlineAt: null`.

**Watch-only change-detection may be silently failing.** `syncWatchSource` fetches via plain `fetch()` (`common.ts`). For Imperva/Cloudflare-gated sites it throws → `recordFailure` → after 10 consecutive failures the source is **auto-disabled**. The intended "detect changes every day" likely is not happening for the gated firms, and nothing surfaces that.

## Two worlds (the constraint that shapes the design)

| | World 1 — deterministic JSON feeds | World 2 — JS-rendered / bot-gated |
|---|---|---|
| **Firms** | Man Group, Point72, Jane Street *(live today)*; Morgan Stanley, Barclays, Blackstone (Workday); J.P. Morgan, Schroders (Oracle Cloud); HSBC, Citi (Eightfold) | tal.net (BofA, Nomura, Jefferies, Rothschild, Evercore, Lazard, Fidelity); Avature (UBS, Macquarie); Goldman `higher.gs.com`; BlackRock; Deutsche Bank |
| **Reachable with `fetch()`?** | Yes — public JSON (Workday needs POST; Oracle/Eightfold are REST) | No — SPA shells, Imperva/Cloudflare CAPTCHA, no public JSON |
| **This branch** | **Build out fully** — real roles + dates + status | **Honest daily watch** — change-detection on /radar, never faked as live |

Reliable live data is achievable for World 1 without a browser. World 2 is deferred to a later headless-rendering branch (per decision below); for now it stays watch-only, but the watch path is hardened so daily change-detection genuinely works and reports honestly.

## Decisions (from brainstorming)

1. **World 2 stays watch-only this branch.** Daily cron change-detection is "good enough" for the gated firms; do not build Playwright now. → Harden the watch path so it actually runs daily and surfaces unreachable sources instead of silently auto-disabling.
2. **Infer deadlines from the recruiting cycle when a feed publishes none**, rather than showing "no deadline." Inferred deadlines are **clearly marked as estimates** so they add coverage without claiming false precision.

---

## Design

### 1. New deterministic adapters (World 1 coverage: 3 → ~9 firms)

Three new adapters behind the existing `SourceAdapter` interface, each a pure `payload → RawOpportunity[]` mapper (mirrors `greenhouse.ts`), unit-tested against captured JSON fixtures:

- **`WorkdayAdapter`** — replaces the throwing stub. POSTs to `/wday/cxs/{tenant}/{site}/jobs` with `{limit, offset, searchText, appliedFacets}`, paginates, maps `jobPostings[]` (title, externalPath, locationsText, postedOn). Covers Morgan Stanley, Barclays, Blackstone.
- **`OracleCloudAdapter`** — GETs `recruitingCEJobRequisitions?onlyData=true&finder=findReqs;siteNumber={site}`, paginates, optionally fetches per-req detail for location/dates. Covers J.P. Morgan, Schroders.
- **`EightfoldAdapter`** — queries the public positions API filtered to UK/intern. Covers HSBC; Citi attempted (PCSX returned 403 on probe — see spike).

Each adapter reuses `classifyPosting()` so inclusion rules stay in one tested place. Wire all three into `adapterFor()`.

### 2. Verification spike (precedes adapter work)

The research probes hit 400/403 (Workday needs a POST body; Eightfold is token-gated). Before committing each adapter, make **one live call per ATS** to confirm it returns usable JSON today, and **capture the response as a test fixture**. If an endpoint is no longer reachable unauthenticated (e.g. Citi/Eightfold 403), that firm drops to World 2 watch-only for this branch — documented, not silently skipped.

### 3. Accurate deadlines & status

- **Real deadlines where exposed:** capture close/valid-through from Workday/Oracle detail resources and JSON-LD `validThrough`. Populate `deadlineAt` + `opensAt`.
- **Inferred deadlines where not exposed:** a new deterministic `inferDeadline(roleFamily, firstSeenAt, cycle)` derives an estimated close date from known UK-finance cycle windows (most summer-internship deadlines cluster Nov–Jan, rolling). Stored in `deadlineAt` with a new `deadlineEstimated: Boolean` flag on `Opportunity` so the UI can mark it "est." Estimates never override a real published deadline.
- **Status accuracy / removal detection:** a role present in a prior sync but **absent from its feed for 2 consecutive syncs → `CLOSED`** (debounce avoids flapping on a transient empty fetch). A passed `deadlineAt` with no live confirmation → `CLOSED`. Requires tracking per-(source, role-key) presence across runs.

### 4. Honesty layer (kills the "looks unreliable" feeling)

- Each firm/source carries a visible **freshness state**: `live` (last-sync time shown), `watch` (change-detected, review on /radar), or `link-only` (no automatable feed).
- The tracker title strip and rows reflect real state; estimated deadlines render with an explicit "est." marker; no firm is presented as live when it isn't.

### 5. Harden the watch path (World 2 daily change-detection)

- `syncWatchSource` failures on gated sites should set an explicit **`unreachable`** status rather than counting toward auto-disable; surface "couldn't reach — last seen N days ago" on /radar instead of silently disabling.
- Keep sitemap-based watches (Citadel domains) working as the reliable case; treat CAPTCHA/403 as a distinct, reported state.

---

## Data model changes (additive — run by user)

Per project convention, schema changes are additive SQL the **user runs** (`prisma/sql/`, see [[cyclops-overhaul]]):

- `SourceType` enum: add `ORACLE_CLOUD`, `EIGHTFOLD` (Workday already present).
- `Opportunity`: add `deadlineEstimated Boolean @default(false)`.
- `IngestionSource`: extend `lastStatus` usage with an explicit `unreachable` state (string convention — no column change) and rely on existing `lastChangedAt` for watch freshness.
- Possible: a lightweight per-source `seenKeys Json?` (or reuse `watchState`) to track role presence across runs for removal detection.

## Components & boundaries

- `ingestion/adapters/workday.ts`, `oracle-cloud.ts`, `eightfold.ts` — pure mappers, each independently testable against fixtures.
- `ingestion/deadline-infer.ts` — pure `inferDeadline()` + cycle table; unit-tested.
- `ingestion/sync.ts` — `adapterFor()` extended; removal-detection logic added to `syncSource`/`importDataset`.
- `ingestion/import.ts` — sets `deadlineEstimated`; applies removal → `CLOSED` transition.
- `ingestion/watch.ts` / `syncWatchSource` — `unreachable` state, no silent disable.
- `prisma/seed.ts` — new live source rows for the World 1 firms (kind = WORKDAY / ORACLE_CLOUD / EIGHTFOLD), with tenant/site identifiers.
- UI (`tracker/page.tsx`, board, ticker) — freshness state + "est." deadline marker.

## Testing

- TDD for every pure unit: each adapter mapper (fixture in → expected `RawOpportunity[]` out, incl. classification exclusions), `inferDeadline`, removal-detection state machine, watch `unreachable` transition.
- Live spike calls are one-off verification + fixture capture, not part of the test suite (no network in tests).
- Existing `classify`/`start-application` tests stay green.

## Out of scope (explicit)

- Playwright / headless rendering for World 2 — separate follow-up branch.
- Lever/Ashby seed expansion beyond what research supports.
- Any login, form submission, or crossing an apply wall — read public surfaces only (unchanged guarantee).

## Success criteria

1. Live role coverage rises from 3 firms to ~9 (subject to spike confirmation).
2. Every live role shows a deadline — real where published, clearly-marked estimate otherwise.
3. Roles that leave a feed transition to `CLOSED` within 2 syncs; passed deadlines close.
4. World 2 firms show an honest watch/link state and unreachable sources are reported, not silently disabled.
5. No firm is presented as "live" when it has no live feed.
