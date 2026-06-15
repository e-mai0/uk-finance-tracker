# Cyclops — Project Status

_Last updated: 2026-06-15_

A snapshot of where the project is, so any future session (human or agent) can pick
up without re-deriving context. For setup detail see `README.md`; for the
extension see `extension/README.md`. For manual deploy gates see
`docs/MANUAL-TASKS.md`.

**Cyclops** (package name still `uk-finance-tracker`) is an AI-powered
**application OS** for UK internship applicants — tracker, apply copilot,
persistent memory, and an ambient agent. Evolved from **Trackr**; the public
landing and app shell are branded Cyclops.

Spec: `docs/superpowers/specs/2026-06-09-cyclops-application-os-design.md`

---

## 1. Snapshot

- **Live:** https://trackr-brown.vercel.app — demo login `demo@trackr.local` / `demo1234`
- **Repo:** `github.com/e-mai0/uk-finance-tracker` (private). Default branch **`main`**;
  **push to `main` auto-deploys to Vercel production.**
- **Latest `main` commit:** `82661c0` — _"Make Cyclops chat directive, adaptive, and easy to act on"_ (#22)
- **Tests:** 502 passing (`npm test`); CI runs `tsc` + `npm test` on every push/PR.
- **Extension:** built and working, loaded **unpacked** locally — not on Chrome Web Store.

### Recently shipped (2026-06-13 → 2026-06-15)

| PR | What |
|----|------|
| **#3/#4** | 3-step onboarding wizard; memory sync to `profile.md`; shared questionnaire in Settings |
| **#6** | Tracker live-listings reliability — 8 ATS adapters, 23 seeded sources, deadline inference, health-gated close/reopen |
| **#7** | Writing engine consolidated into `src/server/engine/skills/index.ts` |
| **#8** | Sync concurrency — 5 parallel sources, 300s budget |
| **#10** | Retired curated dataset seed — tracker is live-sourced only |
| **#11–#13** | CV Builder (`/cv-builder`, `/my-cv`, PDF/Word export); `BuiltCv` + SQL gate |
| **#14** | Chat stream abort on unmount; broader career scope; 10s timeout on voice/story seeding |
| **#15** | tal.net lenient HTTP parser |
| **#17–#19** | Vercel Speed Insights + Web Analytics |
| **#18** | Landing page revamp — tracker-faithful hero, broadened beyond finance-only |
| **#20** | Static landing (CDN); functions pinned to `lhr1` (London, co-located with Supabase) |
| **#21** | **Deployed** — P2024 connection-pool crash fix on onboarding → `/today` (`db.ts` pool 1→5) |
| **#22** | Cyclops chat prompt: directive, adaptive coach (default-and-confirm, lead with next step) |

### Open items / TODO

- [ ] **Gate D** (`docs/MANUAL-TASKS.md`) — apply remaining SQL, smoke-test UI, verify crons
- [ ] **Rotate two secrets** — `ANTHROPIC_API_KEY` and Supabase `service_role` were pasted in chat
- [ ] **Gate B** — human judgment of writing eval (`src/eval/REPORT.md`; automated pre-judge 20/0/0)
- [ ] Extension **icons** + Chrome Web Store listing
- [ ] **Password reset** — not implemented (needed before wider beta)
- [ ] Remove or lock down **demo credentials** on production

---

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack), TypeScript, React 19 |
| Styling | Tailwind CSS v4 (`@theme` tokens) + hand-built primitives. GB+ design: Zilla Slab / Karla / Fragment Mono |
| Auth | Auth.js v5 (`next-auth@5.0.0-beta.25`) — Credentials + bcrypt, JWT sessions |
| ORM / DB | Prisma 6 + PostgreSQL (Supabase, eu-west-2). Pooled `DATABASE_URL` (pgbouncer); `DIRECT_URL` for DDL |
| AI | AI SDK 6 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`); Claude Sonnet 4.6 (reasoning/drafts), Haiku 4.5 (cheap calls) |
| Embeddings | pgvector + Voyage AI (`voyage-3.5-lite`) |
| File storage | Supabase Storage (private `cvs` bucket). CV parse: `unpdf` (PDF), `mammoth` (DOCX) |
| Validation | Zod |
| Tests | Vitest — 502 tests (64 files in `src/test/`; extension tests not in CI) |
| Extension | Manifest V3, Vite + `@crxjs/vite-plugin`, Shadow-DOM panel |
| Hosting | Vercel (`lhr1` region). 3 daily crons in `vercel.json` |
| Analytics | Vercel Speed Insights + Web Analytics |

---

## 3. Product surfaces

### Public

| Route | Purpose |
|-------|---------|
| `/` | Static marketing landing (CDN; logged-in users redirected at edge) |
| `/login`, `/signup` | Email/password auth |

### Authenticated app

| Route | Purpose |
|-------|---------|
| `/onboarding` | 3-step wizard: Essentials (required) → CV (optional) → Questionnaire (optional) |
| `/today` | Home — morning brief, "Needs you" queue, upcoming deadlines |
| `/tracker` | Dense internship board with fit scoring, keyboard nav, listing peek |
| `/tracker/[id]` | Listing detail |
| `/radar` | Fresh finds, Firm Scout, per-source ingestion health |
| `/applications` | Application pipeline by stage |
| `/applications/[id]` | Application workspace (status stepper, drafts) |
| `/chat` | Full-page Ask Cyclops |
| `/memory` | Markdown memory tree editor |
| `/cv-builder` | Guided CV form + AI chat assistant |
| `/my-cv` | Saved CV + PDF/Word download |
| `/settings` | Profile, questionnaire, apply profile, answer bank, extension token |
| `/activity` | Agent action log |

**Cyclops dock** — permanent right-rail chat on Today, Tracker, Applications (⌘J expand).

**Command palette** — ⌘K search pages, listings, conversations.

### Hard product rule

Human-in-the-loop only — Cyclops never auto-submits applications, solves captchas,
or scrapes employer data.

---

## 4. Features

### Cyclops application OS (Phases 1–4, shipped 2026-06-10)

- **Memory core** — per-user markdown tree (`profile.md`, `voice.md`, `strategy.md`,
  `stories/*`, `companies/*`) with revisions, anti-rot gardener, pgvector recall.
- **Chat brain** — AI SDK 6 tool-loop agent (`POST /api/chat`): memory CRUD, app/opportunity
  search, fit check, employer research, draft text, update application status. Per-user
  daily token budget.
- **Writing engine** — draft → critique → revision; draft-edit learning to `voice.md`;
  outcome distillation on status changes.
- **One-button apply v2** — memory-backed suggestions, story provenance, prestaged drafts
  (max 3), chat deep links, tracker "Ask Cyclops".
- **Agent fallback** — bounded 3-round agent assist in extension panel (`POST /api/ext/agent`).
- **Overnight prep** — deadline-near research warmup, morning brief, gardener daily cron.

### GB+ UI revamp (shipped 2026-06-11)

Attention store, live nav badges, dense tracker board, Cyclops dock, real Today page,
draft review → answer bank, applications workspace, ⌘K palette, `/activity`.

### Tracker live-listings reliability (shipped 2026-06-13, PR #6)

- **23 live sources** in `prisma/sources.ts` (~22 firms): Greenhouse, Workday, Oracle Cloud,
  Eightfold, Avature, Radancy, tal.net, Goldman GraphQL, Deutsche Beesite, Jane Street JSON,
  + Citadel watchers.
- **Deadline inference** — cycle-based `estimated + rolling`; real deadlines always win.
- **Health-gated close/reopen** — roles absent for 2 healthy syncs or past a real deadline
  close; never close on failed fetch.
- **UI** — estimated deadlines show **"est. · rolling"**.
- **Sync** — 5 concurrent sources, 270s time guard, daily 07:00 UTC cron.

### Onboarding revamp (shipped 2026-06-13, PR #3/#4)

3-step wizard; essentials alone finishes onboarding. Optional CV distils into `profile.md`;
optional questionnaire seeds voice/stories. Shared `QuestionnaireForm` in Settings.
`workAuth` optional — unknown auth neither boosts nor penalises fit score.

### CV Builder (shipped 2026-06-14, PR #11–#13)

`/cv-builder` (form + dedicated chat), `/my-cv` (PDF via `/cv-print`, Word via
`/api/cv/docx`). Grounding sync to apply profile for extension/LLM use.

### Apply Copilot (extension)

Autofill Greenhouse / Lever / Ashby (Workday best-effort). On-page Shadow-DOM panel
drafts answers. Bearer token auth via Settings. Records applications to `/applications`.

### Radar + Firm Scout

Live ingestion from public ATS feeds. Firm Scout: paste Greenhouse/Lever/Ashby URL →
auto-detect → board pulled immediately. Workday URLs recognised but queued as review
(Firm Scout path; registry Workday sources sync live).

---

## 5. SQL migration gates

Schema changes are applied manually via `prisma/sql/*.sql` (no `prisma/migrations/`).
Apply in order; all additive and idempotent.

| File | Status | Impact if missing |
|------|--------|-------------------|
| `2026-06-09-cyclops-memory.sql` | Applied (Gate A) | Cyclops core broken |
| `2026-06-09-pgvector.sql` | Applied (Gate A) | Semantic search degraded |
| `2026-06-10-cyclops-phase2.sql` | Applied (Gate A) | Phase 2 features broken |
| `2026-06-11-attention-items.sql` | **Open** (Gate D) | Badges/Today queue empty (graceful degrade) |
| `2026-06-11-radar-ingestion.sql` | **Open** (Gate D) | `/radar`, sync cron, Firm Scout hard-fail |
| `2026-06-13-tracker-reliability.sql` | **Unconfirmed** | New columns/enums for ingestion + deadlines |
| `2026-06-14-cv-builder.sql` | Applied (PR #13) | CV routes 500 |

---

## 6. Crons (`vercel.json`)

| Schedule (UTC) | Path | Purpose |
|----------------|------|---------|
| 05:30 daily | `/api/cron/overnight` | Morning briefs, deadline-near research warmup |
| 06:00 daily | `/api/cron/gardener` | Memory anti-rot |
| 07:00 daily | `/api/ingest/sync` | Live job-board sync (Bearer `CRON_SECRET`) |

All three need verification in Vercel → Cron Jobs (Gate D).

---

## 7. Architecture highlights

```
Web app (Next.js, lhr1)                   Extension (MV3)
──────────────────────                   ─────────────────
Auth.js sessions                         Service worker (bearer token)
Prisma + Supabase Postgres               Content scripts (detect, autofill, panel)
Memory tree + pgvector                   Shadow-DOM draft panel
AI SDK 6 brain (POST /api/chat)     ◄──► POST /api/ext/{profile,cv,answer,agent,…}
Overnight prep + attention queue
```

- **Connection pool:** `src/server/db.ts` raises Prisma `connection_limit` to 5 at
  client construction (PR #21) — fixes P2024 crashes when `/today` fans out concurrent
  queries against Supabase's `connection_limit=1` pooler URL.
- **Extension auth:** personal API tokens (SHA-256 hash in `ApiToken`); minted in Settings.
- **Landing:** fully static `/` — no auth/DB on render; logged-in redirect at edge.

---

## 8. Data model

`prisma/schema.prisma` — **28 models**, including:

`User`, `Profile`, `Preferences`, `ApplyProfile`, `BuiltCv`, `Employer`,
`Opportunity`, `SavedOpportunity`, `MatchScore`, `Application`, `AnswerBankItem`,
`GeneratedDraft`, `ApiToken`, `MemoryFile`, `MemoryRevision`, `ChatSession`,
`ChatMessage`, `AttentionItem`, `IngestionSource`, `IngestionRun`,
`EmployerResearch`, `DraftEdit`, `GardenerQuestion`, `ContentEmbedding`,
`DailyUsage`, and related enums.

RLS enabled on new tables with no policies (Prisma superuser bypasses).

---

## 9. Local dev

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # prisma generate + next build
npm test               # vitest (502 tests)
```

```bash
cd extension && npm install && npm run build   # -> extension/dist
# Load unpacked via chrome://extensions
```

Env: see `.env.example`. Required: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
`AUTH_URL`. Optional (features degrade gracefully): `ANTHROPIC_API_KEY`,
`VOYAGE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
`CYCLOPS_DAILY_TOKEN_BUDGET`.

**Gotchas**
- `prisma db push` against prod is blocked; apply additive SQL via Supabase SQL editor.
- CV file-attach inputs can't be auto-filled (browser security).
- Tracker may look sparse off-season — listings are live-sourced only (no curated seed).

---

## 10. Known limitations & fast-follows

- **Autofill accuracy** — weak on typeaheads, date pickers, demographics.
- **Workday** — live via registry adapters; Firm Scout queues user-pasted Workday URLs.
- **Citadel** — watch-only sitemap diff, no live listings.
- **Mobile** — no responsive rails for `/chat` + `/memory`.
- **Password reset** — not built.
- **Extension** — no icons; not on Chrome Web Store.
- **Writing eval** — Gate B human judgment pending (`src/eval/REPORT.md`).
- **`npm run lint`** — pre-existing config failure (`nextVitals is not iterable`).
- **Branding drift** — README/package.json/extension still say Trackr in places.
- **API hardening** — rate limiting on `/api/ext/*` not yet implemented.
- **Off-season sparsity** — live-only tracker; expected when few roles are open.

---

## 11. Operational facts

- **Supabase:** project `trackr`, ref `vemgdpahhhabkphgevzx`, region **eu-west-2** (London).
  Pooler host is **aws-1**-eu-west-2. Private bucket `cvs` (10 MB limit).
- **Vercel:** team `e-mai0s-projects`, project `trackr`. Region **lhr1**. Prod env vars:
  `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `ANTHROPIC_API_KEY`,
  `VOYAGE_API_KEY`, `CYCLOPS_DAILY_TOKEN_BUDGET`, `CRON_SECRET`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`.
- **Beta readiness:** feature-complete for closed alpha; ops gates (SQL verification,
  smoke tests, secret rotation, extension distribution) remain. See beta readiness plan
  in `.cursor/plans/` or session notes from 2026-06-15 review.
