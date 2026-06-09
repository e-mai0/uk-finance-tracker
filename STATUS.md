# Trackr — Project Status

_Last updated: 2026-06-09_

> **IN FLIGHT — Cyclops Phase 1 (branch `cyclopslevelup`, not yet merged).**
> Trackr is being overhauled into **Cyclops**, an AI "application OS"
> (spec: `docs/superpowers/specs/2026-06-09-cyclops-application-os-design.md`;
> plan: `docs/superpowers/plans/2026-06-09-cyclops-phase-1-memory-chat.md`).
> Phase 1 is fully implemented and reviewed on the branch: per-user markdown
> memory tree with revisions + anti-rot gardener, AI SDK 6 agent brain behind
> `POST /api/chat` (six tools, confidence/uncertainty discipline, per-user
> daily token budget), `/chat` and `/memory` pages, onboarding voice/story
> seeding, pgvector semantic recall (Voyage embeddings). 130 unit tests green;
> `tsc` + `next build` clean. The deterministic extension autofill is untouched
> and its API responses are byte-compatible.
>
> **Before merging `cyclopslevelup` to `main` (main auto-deploys prod!):**
> 1. Apply the additive SQL to Supabase (SQL editor or `psql "$DIRECT_URL" -f …`),
>    in order: `prisma/sql/2026-06-09-cyclops-memory.sql` then
>    `prisma/sql/2026-06-09-pgvector.sql` (needs the `vector` extension).
> 2. Set `VOYAGE_API_KEY` and `CYCLOPS_DAILY_TOKEN_BUDGET` in `.env` + Vercel
>    (only after step 1). Optional backfill: `npx tsx scripts/backfill-embeddings.ts`.
> 3. Smoke test on localhost: /chat ("remember X" → memory diff chip; Stop
>    mid-tool-call then send again), /memory (edit/save/restore), one extension
>    autofill + answer generation round.
>
> Known fast-follows (logged, not blocking): gardener cron schedule (only the
> every-10-edits trigger exists), mobile rails for /chat + /memory, gardener
> question "asked" detection is conservative, `npm run lint` has a pre-existing
> config failure (`nextVitals is not iterable`), `gray-matter` dep unused until
> frontmatter parsing lands in phase 2.

A snapshot of where the project is, so any future session (human or agent) can pick
up without re-deriving context. For product/setup detail see `README.md`; for the
extension see `extension/README.md`.

---

## 1. Snapshot

- **Live:** https://trackr-brown.vercel.app — demo login `demo@trackr.local` / `demo1234`
- **Repo:** `github.com/e-mai0/uk-finance-tracker` (private). Default branch **`main`**;
  **push to `main` auto-deploys to Vercel production.**
- **Local:** `C:\Users\ericc\dev\uk-finance-tracker` (deliberately outside OneDrive).
- **Latest deployed commit:** `6ecc334` — _"feat: apply copilot — autofill browser extension + AI drafting backend"_ (state `READY`).
- **What's live now:** the original tracker MVP **plus** the full Apply Copilot
  (web backend + API). The browser **extension** is built and working but is loaded
  **unpacked** locally — it is not yet on the Chrome Web Store.

### Open items / TODO
- [ ] **Rotate two secrets** — `ANTHROPIC_API_KEY` and the Supabase `service_role`
  key were pasted in chat. Regenerate both; update `.env` + Vercel. The
  `service_role` key is the priority (bypasses RLS → full DB access).
- [ ] **Pick a refinement direction** (see §8). Candidates: autofill accuracy,
  Workday support, answer/CV polish, productize (Web Store).
- [ ] Extension has **no icons** yet (fine for dev; required before publishing).

---

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, Server Components + Server Actions), TypeScript, React 19 |
| Styling | Tailwind CSS v4 (`@theme` tokens) + hand-built primitives. Theme = "Broadsheet Terminal" (ivory paper, claret `#7c2433` accent, Fraunces serif, mono numerics) |
| Auth | Auth.js v5 (next-auth beta) — Credentials + bcrypt, JWT sessions, `AUTH_TRUST_HOST` |
| ORM / DB | Prisma 6 + PostgreSQL (Supabase). Pooled `DATABASE_URL` (6543, pgbouncer) at runtime; `DIRECT_URL` (5432) for migrations |
| AI | `@anthropic-ai/sdk` — `claude-haiku-4-5` (short answers), `claude-sonnet-4-6` (cover letters). Server-only |
| File storage | Supabase Storage (private `cvs` bucket) via `@supabase/supabase-js` service role. CV parse: `unpdf` (PDF), `mammoth` (DOCX) |
| Validation | Zod | 
| Tests | Vitest (36 tests, all green) |
| Extension | Manifest V3, TypeScript, Vite + `@crxjs/vite-plugin`, vanilla TS + Shadow-DOM panel |
| Hosting | Vercel (web). Extension ships separately (Chrome Web Store / unpacked) |

---

## 3. Features

### Tracker MVP (original)
- Email/password auth (sign up / in / out).
- Six-step onboarding wizard (education, interests, eligibility, locations, targets), Zod-validated, autosaving.
- Dashboard tracker: dense sortable/filterable table of UK finance summer internships, summary cards, status badges, **transparent 0–100 fit scoring** (deterministic, no ML) with reasons, "Top matches" panel.
- Saved roles + private notes. Opportunity detail pages. Settings (edits recompute scores).
- Seed data: ~24 employers, ~45 opportunities (2027 cycle), original normalized summaries.

### Apply Copilot (new — built + deployed 2026-06-05)
Human-in-the-loop. **Hard rule: never auto-submits, solves captchas, or scrapes** — the user always reviews and submits.
- **Real CV upload + parsing** (Settings) → private Supabase Storage + extracted text used to ground generation.
- **Apply profile** (Settings): phone, links, work-auth/sponsorship statements, optional self-ID — the data autofilled into forms.
- **Answer bank** (Settings + auto-grown): reusable Q&A; near-identical questions reuse a saved answer, otherwise the LLM generates one.
- **AI generation**: cover-letter draft button on opportunity pages; on-page answer drafts in the extension. Grounded in the user's CV, UK English, finance tone — not boilerplate.
- **Applications tracker** (`/applications`): every autofilled/submitted role recorded with an editable status (Draft → Submitted → Interviewing → Offer …).
- **Browser extension** (`extension/`): autofills Greenhouse / Lever / Ashby forms (Workday best-effort) and drafts answers in an on-page Shadow-DOM panel. Records the application back to the dashboard.

---

## 4. Apply Copilot architecture

The application forms live on **external** ATS sites, so the copilot is a **browser
extension** backed by a small API on the web app.

```
Web app (Next.js)                          Extension (extension/, MV3)
─────────────────                          ───────────────────────────
identity, data, CV storage, all LLM   ◄──► service worker (holds token,
calls; bearer-authed API:                  calls API) + content scripts
  GET  /api/ext/profile  (field map)        that detect the form, autofill,
  GET  /api/ext/cv       (signed URL)        and render the panel.
  POST /api/ext/answer   (bank hit or AI)
  POST /api/ext/application (track)
```

- **Auth bridge:** extension can't use the session cookie cross-origin → user mints
  a **personal API token** in Settings (stored only as a SHA-256 hash in `ApiToken`;
  revocable). Generating it auto-connects an installed extension (postMessage
  handoff), or it's pasted into the popup. Sent as `Authorization: Bearer`.
- **Middleware:** `/api/*` is excluded from the NextAuth session gate; the ext API
  does its own bearer auth. New gated web pages added to `APP_PREFIXES` in
  `src/server/auth.config.ts`.
- **CORS:** not a security boundary here (bearer, not cookies) — `/api/ext/*` allows
  any origin; the extension fetches from its service worker via `host_permissions`.

---

## 5. Data model (Prisma, `prisma/schema.prisma`)

Original: `User`, `Profile`, `Preferences`, `Employer`, `Opportunity`,
`OpportunityTag`, `OpportunitySource`, `SavedOpportunity`, `MatchScore`,
`IngestionRun`.

Added for the copilot:
- **`ApplyProfile`** (1:1 User) — reusable apply data + CV (`cvStoragePath`,
  `cvText`, `cvFileName/Size`). CV was **moved off `Profile`** (the old
  `Profile.cvFileName/cvFileSize` columns are re-added as nullable/unused for
  back-compat — see §7).
- **`AnswerBankItem`** — reusable Q&A (`questionNormalized` for fuzzy match).
- **`Application`** — tracked external application (`externalUrl`, `ats`, `status`,
  `source`; unique on `[userId, externalUrl]`).
- **`GeneratedDraft`** — history of AI artefacts.
- **`ApiToken`** — extension auth (SHA-256 hash only).
- Enums: `ATSKind`, `ApplicationStatus`, `ApplicationSource`, `DraftKind`.

Migrations applied to Supabase via the MCP `apply_migration`. New tables have **RLS
enabled with no policies** (Prisma superuser bypasses; public API locked out).

---

## 6. Repo structure (key paths)

```
prisma/schema.prisma            # 15 models
src/app/
  (app)/dashboard | saved | settings | applications | opportunities/[id]
  api/ext/{profile,cv,answer,application}/route.ts   # extension API (bearer)
  api/auth/[...nextauth]
src/server/
  auth.ts auth.config.ts db.ts matching.ts
  ext-auth.ts ext-http.ts ext-profile.ts             # extension API support
  storage.ts cv/parse.ts                             # CV upload + parse
  ai/generate.ts                                     # LLM (Anthropic)
  actions/{auth,onboarding,saved,settings,applyProfile,extension,copilot,applications}.ts
  queries/opportunities.ts
src/lib/{scoring,filters,validation,answers,constants,utils}.ts
src/components/{ui,tracker,onboarding,settings,applications,copilot}/
src/test/                        # scoring, filters, validation, answers
src/ingestion/                   # dataset + import + adapters (stubs)
extension/                       # standalone MV3 extension (own package.json/build)
  src/background.ts  src/content/{index,detect→adapters/*,autofill,panel,connect,messaging,field-map}.ts
  src/popup/  src/shared/
scripts/mint-test-token.ts       # dev helper: mint an ext API token
docs/source-research/            # earlier source-research plans (PR #1)
```

---

## 7. Local dev & build

**Web app**
```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # prisma generate + next build
npm run test           # vitest (36 tests)
```
Env in `.env` (gitignored): `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`,
and (optional, for copilot) `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`. App runs without the copilot keys; those features
degrade gracefully. See `.env.example`.

**Extension**
```bash
cd extension
npm install
npm run build          # -> extension/dist
```
Load `extension/dist` via `chrome://extensions` → Developer mode → Load unpacked.
Connect: Trackr → Settings → Browser extension → Generate token (auto-connects or
paste in popup). Test on a Greenhouse/Lever/Ashby application form.

**Gotchas**
- Windows: `next build`/`prisma generate` can hit `EPERM` on the Prisma engine DLL
  if a stray `node` (dev server) still holds it — kill leftover node processes.
- `prisma db push` against prod is blocked by tooling; apply schema via Supabase
  MCP `apply_migration` instead (additive DDL).
- CV file-attach inputs can't be auto-filled by any extension (browser security) —
  attach manually.

---

## 8. Known limitations & candidate next steps

- **Autofill accuracy** — heuristic label→key matcher. Known weak spots: Greenhouse
  typeahead **school/degree** fields (need option-selection, not plain text),
  demographic dropdowns, graduation **date pickers**. Best refined against real forms.
- **Workday** — best-effort only (complex multi-step SPA). Matters most if target
  firms are large banks.
- **Answer/CV polish** — char-limit adherence (model can overshoot; we trim to a word
  boundary), per-question-type tone, smarter answer-bank reuse, one-click "download
  my CV" in the panel.
- **Productize** — extension icons, Chrome Web Store listing, cleaner first-run.
- **Model/cost** — answer model is Haiku (cost is negligible at current volume). Model
  names are isolated constants in `src/server/ai/generate.ts`; could make
  env-configurable / route via OpenRouter to A/B cheaper models later. (Avoid DeepSeek
  for CVs — China-hosted, GDPR.)
- **API hardening** — consider rate limiting on `/api/ext/*`.

---

## 9. Operational facts

- **Supabase:** project `trackr`, ref `vemgdpahhhabkphgevzx`, region eu-west-2 (London).
  Pooler host is **aws-1**-eu-west-2 (not aws-0). Private bucket `cvs` (10 MB limit).
- **Vercel:** team `e-mai0s-projects`, project `trackr`. Prod env vars set:
  `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `ANTHROPIC_API_KEY`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Branching note:** copilot work was done on `source-research/uk-finance-source-plans`;
  PR #1 merged the earlier source-research commit into `main`, then the copilot commit
  was rebased on top and pushed (`6ecc334`).
- **Verified live post-deploy:** landing `200`; `/api/ext/profile` → `401` (new API
  live); `/applications` → `307` to `/login` (gating live). API smoke-tested earlier:
  profile field map, application upsert, answer save/bank-hit, AI generation, storage
  round-trip — all OK.
