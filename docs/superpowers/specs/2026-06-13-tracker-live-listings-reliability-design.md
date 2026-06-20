# Tracker live-listings reliability — design

**Date:** 2026-06-13
**Status:** Draft for review (revised after live endpoint research)
**Outcome:** The tracker accurately reflects *live* listings — real open roles, accurate open/closed status, and trustworthy deadlines — across the full firm set, instead of firms standing in as generic careers-page links with stale or absent dates.

---

## Problem

The ingestion *research* (`src/ingestion/source-plans/uk-finance-2027.json`) covers ~25 firms, but the *implementation* only publishes live roles for **3 firms** (Man Group, Point72 via Greenhouse; Jane Street via its JSON feed). Five firms are seeded `watchOnly` (link-only stand-ins), and ~17 aren't wired in at all (`WorkdayAdapter` is a stub that throws). `sync.ts → adapterFor()` only handles `GREENHOUSE | LEVER | ASHBY | CAREERS_PAGE`.

Two consequences:
1. **"Generic careers page"** — most firms show a link with no live roles behind it (watch-only or not wired).
2. **Deadlines are inaccurate** — `deadlineAt` is only ever set from JSON-LD `validThrough`, which no live source uses; Greenhouse (the only working role feed) exposes no deadline, so live roles carry `deadlineAt: null`.

Also: nothing ever marks a role `CLOSED`. `importDataset` upserts as `OPEN` and removed roles stay `OPEN` forever. And `syncWatchSource` fetches SPA shells via plain `fetch()` — for client-rendered sites the shell never changes, so change-detection is blind; for failures it counts toward auto-disabling after 10 misses.

## Key research finding (live-probed 2026-06-13)

**Every firm is ingestable with a plain server-side `fetch` on Vercel — no headless browser, no paid unlocker, no CAPTCHA solving.** Each ATS exposes a machine-readable surface that returns real data to an unauthenticated request. This collapses the earlier "World 1 / World 2" split: it's all deterministic ingestion, just with per-ATS shapes.

### Per-firm verified approach

| ATS / surface | Firms | Endpoint (verified live) | Deadline in feed? | Stable id |
|---|---|---|---|---|
| Greenhouse API *(live today)* | Man Group, Point72 | `boards-api.greenhouse.io/v1/boards/{token}/jobs` | No → infer | gh job id |
| Jane Street JSON *(live today)* | Jane Street | `janestreet.com/jobs/main.json` | No → infer | position id |
| **Workday CXS** | Morgan Stanley, Barclays, Blackstone | `POST /wday/cxs/{tenant}/{site}/jobs` (limit≤20, paginate offset) | No (only postedOn) → infer | `bulletFields[0]` reqId |
| **Oracle Cloud CE** | J.P. Morgan, Schroders | `GET recruitingCEJobRequisitions?expand=requisitionList&finder=findReqs;siteNumber={site}` + per-Id detail | **Yes** — `ExternalPostedEndDate` (detail) | numeric `Id` |
| **Eightfold** | HSBC (`/api/apply/v2/jobs`), Citi (`/api/pcsx/search`) | `GET ...?domain={d}&location=London&start=N` (page size 10) | No → infer | numeric `id` |
| **Avature** | UBS, Macquarie | UBS: embedded JSON in shell + detail page; Macquarie: HTML `SearchJobs?search=internship&jobOffset=N` | UBS **yes** (detail); Macquarie no → infer | numeric jobId/reqid |
| **Radancy / TalentBrew** | BlackRock, Citi, Barclays | `GET {base}/search-jobs/results?Keywords=intern&SearchType=1...` (JSON-wraps-HTML) | No → infer | URL jobId |
| **tal.net** (Saba/Lumesse) | Nomura, Jefferies, Rothschild, Evercore, Lazard, Fidelity, BofA | `GET /candidate/jobboard/vacancy/{board}/adv/` (plain HTML; follow full canonical `/vx/.../opp/<id>` href) | **Yes** — inline on listing/detail | numeric opp id |
| **Goldman bespoke** | Goldman Sachs | `POST api-higher.gs.com/gateway/api/v1/graphql` `roleSearch(experiences:["CAMPUS"])` | No → infer | `externalSource.sourceId` |
| **Deutsche Bank Beesite** | Deutsche Bank | `GET api-deutschebank.beesite.de/graduatesearch/?data={json}` | **Yes** — `PublicationEndDate` | numeric `PositionID` |

Notes from the probes that the build must honor:
- **Workday Barclays detail endpoint is Akamai-gated (406/422)** — use list-only fields for Barclays; tolerate a blocked detail fetch everywhere.
- **Goldman GraphQL introspection is open but may be locked later** — pin the operation text, don't introspect at runtime.
- **Eightfold/Workday can flap** (transient 403) — retry with backoff; never report "0 roles" on a non-200.
- **tal.net**: short `/opp/<id>` URLs 503 — must follow the full canonical href; per-tenant board numbers differ and must be discovered/configured; `robots.txt` disallows named AI bots but allows the default agent on candidate paths — use a neutral honest UA and honor `Crawl-delay: 10`.
- **UK filtering** is most robust **client-side** (on `locationsText` / `PrimaryLocationCountry=="GB"` / parsed location), with server facets as an optional optimization.
- **Off-season zero-count is valid** (Eightfold returns 200 + count 0) — distinguish from a broken feed.

## Decisions (from brainstorming)

1. **Achieve full live coverage with plain fetch.** No headless/browser this branch — research shows it's unnecessary for every firm. (Keep an Imperva-detection guard in the fetch path so if tal.net ever turns on bot protection, that host degrades to watch-only and reports it, rather than silently failing.)
2. **Infer deadlines from the recruiting cycle** where a feed exposes none, clearly marked as **estimated + rolling**, biased earlier ("may close early — apply ASAP"). Real published deadlines always win.

---

## Design

### 1. New adapters (live role coverage: 3 → ~25 firms)

Each is a pure `fetch → RawOpportunity[]` mapper behind the existing `SourceAdapter` interface, unit-tested against captured JSON/HTML fixtures (mirrors `greenhouse.ts`). All reuse `classifyPosting()` so inclusion rules stay in one tested place.

- `WorkdayAdapter` (replaces the throwing stub) — POST CXS, paginate, client-filter UK. *MS, Barclays, Blackstone.*
- `OracleCloudAdapter` — list crawl + per-Id detail for **deadline** + location. *JPM, Schroders.*
- `EightfoldAdapter` — per-tenant endpoint (`apply/v2/jobs` vs `pcsx/search`), paginate by `start`. *HSBC, Citi.*
- `AvatureAdapter` — Macquarie HTML parse; UBS embedded-JSON + detail-page **deadline**. *UBS, Macquarie.*
- `RadancyAdapter` — one generic `{baseUrl, companyId}` adapter parsing the `/search-jobs/results` JSON-wraps-HTML envelope. *BlackRock, Citi, Barclays.*
- `TalNetAdapter` — per-host board config, parse the public job board HTML, follow canonical opp URLs, extract inline **deadlines**, honor Crawl-delay. *Nomura, Jefferies, Rothschild, Evercore, Lazard, Fidelity, BofA.*
- `GoldmanHigherAdapter` — GraphQL `roleSearch`, pinned operation text. *Goldman.* (Routed via `CAREERS_PAGE` hostname dispatch like Jane Street, or its own kind — see data model.)
- `DeutscheBankBeesiteAdapter` — Beesite REST, client-filter `CountryCode=="GB"`, **deadline** from `PublicationEndDate` (treat `2099-12-31` as none). *Deutsche Bank.*

Wire all into `adapterFor()`. Where a firm appears on two surfaces (e.g. Citi on Eightfold *and* Radancy; Barclays on Workday *and* Radancy), pick the one with the better data and dedupe — documented per firm in the plan.

### 2. Verification + fixture capture per adapter

The endpoints were probed live today; before/while building each adapter, capture a current response as a **test fixture** and assert the adapter maps it correctly. If an endpoint has since changed, that surfaces immediately. Live calls are one-off capture, never part of the test suite (tests run offline).

### 3. Deadlines

- **Real where exposed:** Oracle (`ExternalPostedEndDate` via detail), tal.net (inline), Deutsche Bank (`PublicationEndDate`), UBS (detail page). Populate `deadlineAt` (+ `opensAt` where available).
- **Inferred otherwise:** `inferDeadline(roleFamily, firstSeenAt, cycle)` — a pure, deterministic module using realistic UK-finance windows (open Jul–Sep of year N-1; nominal close Oct–Dec; rolling fills from September). Stored in `deadlineAt` with `deadlineEstimated = true` and `isRolling = true`; the UI marks it "est. · rolling." Estimates **never** override a real published deadline. Per-bank exact dates are deliberately **not** hardcoded (least stable signal).

### 4. Status & removal detection (reliability engine)

Adopt the canonical pattern (last-seen + health-gated absence sweep + soft close):

- Each sync bumps `lastSeenAt` and resets `consecutiveMisses` for roles present in a **healthy** fetch.
- **Health gate (false-closure guard):** closure logic runs only when the adapter returned without error and the fetch looks healthy (no 4xx/5xx, not an empty-but-200 anomaly). A source outage **pauses** closure for that source — never cascades closures.
- **Close decision:** passed `deadlineAt` → `CLOSED` immediately; absent from a healthy feed for **2 consecutive syncs** → `CLOSED` (debounced). Detail-page HTTP 410/explicit "closed" text → close immediately where available.
- **Soft close:** set `status=CLOSED`, `closedAt`, `closeReason`; keep the row so a reappearance re-opens it.

### 5. Honesty / freshness layer

- Each source carries a visible state: **live** (with last-sync time), or **unreachable** (reported, not silently disabled).
- Estimated deadlines render with an explicit "est. · rolling" marker; real deadlines render plain.
- Drop the `watchOnly` stand-ins for firms now covered by a real adapter; keep watch only as the *degraded* fallback an Imperva-guard can flip a host into.

### 6. Polite, robust fetching (shared `common.ts` upgrades)

- Identified UA (keep `CyclopsBot/1.0`), explicit connect/read timeouts (already 15s), **full-jitter exponential backoff honoring `Retry-After`**, retry only 429/502/503/504/timeouts, per-host **circuit breaker**, ~1 req/s per host with jitter, honor `robots.txt` `Crawl-delay` (esp. tal.net 10s). Conditional GET (ETag/If-Modified-Since) where supported.
- An **Imperva/Incapsula guard**: detect interstitial markers / incident-ids in a 200 body and treat as a fetch failure → degrade host to `unreachable`, don't publish garbage.

---

## Data model changes (additive — run by user)

Per project convention, additive SQL the **user runs** (`prisma/sql/`, see [[cyclops-overhaul]]):

- `SourceType` enum: add `ORACLE_CLOUD`, `EIGHTFOLD`, `AVATURE`, `RADANCY`, `TALNET`. (Goldman + Deutsche Bank route via `CAREERS_PAGE` hostname dispatch, like Jane Street — no enum value each.) `WORKDAY` already exists.
- `Opportunity`: add `deadlineEstimated Boolean @default(false)`, `isRolling Boolean @default(false)`, `consecutiveMisses Int @default(0)`, `closedAt DateTime?`, `closeReason String?`.
- `IngestionSource`: add `config Json?` (carry tenant/site/board/companyId/domain per ATS — avoids overloading `identifier`) and `lastSuccessfulFetchAt DateTime?` (gates the closure sweep).

## Components & boundaries

- `ingestion/adapters/{workday,oracle-cloud,eightfold,avature,radancy,talnet,goldman-higher,deutsche-beesite}.ts` — pure mappers, each independently testable against fixtures.
- `ingestion/deadline-infer.ts` — pure `inferDeadline()` + cycle table; unit-tested.
- `ingestion/status.ts` — pure removal/close state machine (present/miss/close-reason); unit-tested.
- `ingestion/sync.ts` — `adapterFor()` extended; `config` plumbed to adapters; health gate.
- `ingestion/import.ts` — sets `deadlineEstimated`/`isRolling`; applies the close transition via `ingestion/status.ts`.
- `ingestion/adapters/common.ts` — backoff, circuit breaker, crawl-delay, Imperva guard.
- `prisma/seed.ts` — live source rows for all firms with `config` (tenant/site/board/etc.); drop now-covered `watchOnly` rows.
- UI (`tracker/page.tsx`, board, ticker) — freshness state + "est. · rolling" marker.

## Testing (TDD)

- Each adapter mapper: captured fixture in → expected `RawOpportunity[]` out, including classification exclusions and the per-ATS quirks (Workday 20-row pages, Oracle detail deadline, Eightfold off-season 0, tal.net canonical URL, Radancy `Keywords` param, Beesite `2099-12-31` sentinel).
- `inferDeadline` and the `status.ts` state machine: pure unit tests (present → miss → miss → close; healthy-gate prevents close on failed fetch; deadline-passed close; reappearance re-open).
- Live spike calls are one-off fixture capture, not in the suite (no network in tests). Existing `classify`/`start-application` tests stay green.

## Out of scope (explicit)

- Headless rendering / paid unlockers — research shows they're unnecessary for the current firm set; the Imperva-guard is the contingency.
- Crossing any login/apply wall — read public surfaces only (unchanged guarantee). recsolu (DB) and tal.net apply pages are login-walled and not touched.
- Per-bank hardcoded deadline calendars — inference stays cycle-based and honest.

## Success criteria

1. Live role coverage rises from 3 firms to ~25 (subject to per-firm fixture confirmation at build time).
2. Every live role shows a deadline — real where the feed/detail exposes one, clearly-marked estimate ("est. · rolling") otherwise.
3. Roles absent from a healthy feed for 2 syncs, or past their deadline, transition to `CLOSED`; reappearance re-opens. No closures occur on a failed/empty fetch.
4. No firm is presented as "live" when its feed is unreachable; unreachable sources are reported, not silently disabled.
5. All ingestion runs server-side on Vercel with no browser, polite fetching, and an Imperva-guard contingency.

## Open risks

- These are undocumented/quasi-public endpoints; they can change or lock down. Mitigation: fixtures + per-source health status + the Imperva-guard + circuit breaker make breakage visible and contained, not silent.
- Citi/Barclays appear on two ATSes; dedupe rules must be explicit (chosen in the plan).
- Inferred deadlines are estimates by nature; the "est. · rolling" marker keeps them honest.
