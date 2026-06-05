# Trackr — UK Finance Summer Internship Tracker

**▲ Live:** https://trackr-brown.vercel.app — demo login `demo@trackr.local` / `demo1234`

A production-minded MVP that helps ambitious UK students find, rank, and track
**finance summer internships**. Students sign up, complete a short onboarding,
and land on a dense, premium dashboard where every opportunity is scored for how
well it fits their background — with a plain-English explanation of why.

This is an **original product**. It is functionally inspired by trackers that
list UK finance internships, but ships none of their code, branding, or content.
All opportunity summaries are original, normalized descriptions; it is not
affiliated with or endorsed by any employer listed.

---

## What it does

- **Auth** — email/password sign up, sign in, sign out (self-contained, no
  third-party auth service).
- **Onboarding** — a six-step wizard collecting education, interests,
  eligibility, locations and target employers. Progress autosaves; each step is
  validated.
- **Tracker dashboard** — a dense, sortable, filterable table of UK finance
  summer internships with summary cards, status badges, fit pills and a
  "Top matches for you" panel.
- **Fit scoring** — every user↔opportunity pair gets a transparent 0–100 score
  with human-readable reasons. Deterministic, no ML.
- **Saved roles** — bookmark opportunities and keep private notes per role.
- **Opportunity detail** — full normalized metadata, a scoring breakdown,
  apply/source links, and an AI **cover-letter draft** grounded in your CV.
- **Apply copilot** — a companion browser extension that autofills real
  application forms (Greenhouse / Lever / Ashby) from your profile and drafts
  answers to free-text questions **on the page**. You always review and submit.
- **Applications tracker** — every role you autofill or submit is recorded with
  a status you can update (submitted → interviewing → offer).
- **Settings** — edit your profile and preferences; scores recompute on save.
  Manage your apply profile, CV upload, answer bank, and extension connection.

### Scope

In scope: UK finance summer internships across investment banking, sales &
trading / markets, asset management, private equity / credit, hedge funds,
quant, corporate banking and research.

The **apply copilot** (browser extension) assists with real application forms —
human-in-the-loop only. Intentionally **out of scope**: fully autonomous
auto-submit (the extension never clicks submit, solves captchas, or scrapes
employer data), live scraping / ATS ingestion (interface stubs only), spring
weeks, graduate roles, placements, consulting, general tech roles, employer-side
tooling, and ML-based matching.

---

## Stack & rationale

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Server components + server actions give DB-backed UI with minimal API boilerplate; Vercel-native. |
| Styling | **Tailwind CSS v4** + hand-built primitives | Restrained, premium, dependency-light component set (Button, Input, Select, Badge, Card, Skeleton, chips). |
| Auth | **Auth.js v5 (NextAuth)** — Credentials + bcrypt, JWT sessions | No external service or keys; owns the `users` table; serverless-friendly. |
| ORM | **Prisma** | Type-safe, great migrations, clean Supabase integration. |
| Database | **PostgreSQL (Supabase)** | Free, production-grade Postgres; one DB for local **and** prod. |
| Validation | **Zod** | Shared client + server validation for auth and onboarding. |
| Tests | **Vitest** | Fast, TS-native unit tests for scoring, filtering and validation. |

---

## Project structure

```
prisma/
  schema.prisma            # 10-entity data model
  seed.ts                  # runs the ingestion pipeline + creates the demo user
src/
  app/
    page.tsx               # landing
    (auth)/login, signup   # auth pages
    onboarding/            # multi-step wizard
    (app)/dashboard        # tracker
    (app)/opportunities/[id]
    (app)/saved
    (app)/settings
    api/auth/[...nextauth] # Auth.js route handler
  components/ui            # design-system primitives
  components/tracker       # table, filters, badges, fit pill, save button
  components/onboarding    # wizard
  components/settings      # settings form
  server/
    auth.ts, auth.config.ts# Auth.js (full + edge-safe split)
    db.ts                  # Prisma singleton
    matching.ts            # compute + cache match scores
    actions/               # server actions (auth, onboarding, saved, settings)
    queries/               # typed read queries
  lib/
    scoring.ts             # deterministic fit scoring (unit-tested)
    filters.ts             # pure filter/sort/search (unit-tested)
    validation.ts          # Zod schemas (unit-tested)
    constants.ts, utils.ts
  ingestion/
    types.ts, normalize.ts, import.ts
    datasets/uk-finance-2027.ts   # curated original dataset (~45 roles)
    adapters/              # Greenhouse / Lever / Workday stubs (future ATS)
  test/                    # Vitest suites
  middleware.ts            # auth + onboarding route gating
```

---

## Getting started

### Prerequisites

- Node.js 20+ (developed on Node 24)
- A free **Supabase** project (for PostgreSQL)

### 1. Install

```bash
npm install
```

### 2. Create a database (Supabase)

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Go to **Project → Settings → Database → Connection string**.
3. Copy two connection strings:
   - the **pooled** one (Transaction mode, port `6543`, includes `pgbouncer=true`)
   - the **direct** one (Session mode, port `5432`)

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```env
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
AUTH_SECRET="<run: npx auth secret  — or any long random string>"
AUTH_URL="http://localhost:3000"
```

- `DATABASE_URL` (pooled) is used by the app at runtime.
- `DIRECT_URL` (direct) is used by Prisma Migrate.

### 4. Run migrations & seed

```bash
npm run db:migrate     # creates the schema (prisma migrate dev)
npm run seed           # imports ~45 roles, ~24 employers + a demo user
```

### 5. Start

```bash
npm run dev
```

Open <http://localhost:3000>.

### Demo account

The seed creates a ready-to-use account:

```
Email:    demo@trackr.local
Password: demo1234
```

It is pre-onboarded (Cambridge Economics, graduating 2028, targeting IB / PE /
Markets in London) so you can jump straight to the tracker. Or sign up fresh to
run the full onboarding flow.

---

## How match scoring works

`src/lib/scoring.ts` exposes a pure function:

```ts
scoreOpportunity(profile, preferences, opportunity) -> { score: 0–100, reasons: string[] }
```

It is deterministic and transparent. Weighted rules:

| Signal | Points |
|---|---|
| Role family is in your targets | +30 |
| Timing fits the penultimate-year summer cycle | +15 (or +9 if near-cycle) |
| Location is one of your preferred cities | +20 (or +10 if "open to anywhere in the UK") |
| Work authorization is compatible | +15 (visa-required + no sponsorship → **−15**; sponsorship unknown → +5) |
| Employer is on your target shortlist | +15 |
| Your skills overlap the role's tags | +5 |

The total is clamped to 0–100 and bucketed into **Strong / Good / Moderate /
Low** tiers. Every rule that fires pushes a reason, surfaced on the dashboard and
the opportunity detail page (e.g. *"Matches your interest in Investment
Banking", "Graduating 2028 fits the penultimate-year summer cycle"*).

Scores are computed and cached in the `MatchScore` table when onboarding
finishes and whenever you change your profile/preferences in Settings
(`src/server/matching.ts`). The detail page falls back to a live computation if a
role hasn't been cached yet.

---

## Apply copilot (browser extension)

The copilot helps you fill out and answer real application forms. Because those
forms live on **external** ATS sites (Greenhouse, Lever, Ashby, Workday), the
copilot ships as a **Manifest V3 browser extension** (`extension/`) backed by a
small API on this app.

**Human-in-the-loop by design.** The extension fills fields and drafts answers;
**you review and click submit**. It never auto-submits, never solves captchas,
and never scrapes employer data — it only does what you could do by hand. AI
answers are grounded in your own profile + CV and tuned per employer, so they are
specific rather than the boilerplate that ATS bot-detection flags. This is the
deliberate, defensible model (the same shape as Simplify) — full autonomous
auto-apply is intentionally **not** built, as it carries real blacklisting/ToS
risk that is worst in finance.

### How it fits together

- **Web app** owns identity, data, CV storage and all LLM calls, and exposes a
  bearer-authed API for the extension under `src/app/api/ext/*`:
  - `GET /api/ext/profile` — normalized autofill field map
  - `GET /api/ext/cv` — short-lived signed CV download URL
  - `POST /api/ext/answer` — answer-bank hit or AI generation (grounded in your CV)
  - `POST /api/ext/application` — upserts an `Application` so the dashboard tracks it
- **Auth bridge** — the extension can't use the session cookie cross-origin, so
  you mint a **personal API token** in Settings (stored only as a SHA-256 hash in
  `ApiToken`; revocable). Generating it auto-connects an installed extension, or
  you paste it into the popup.
- **Extension** (`extension/`) — a service worker holds the token and calls the
  API; content scripts detect the form, autofill it, and render an on-page panel
  with an AI **Draft** per free-text question. See `extension/README.md` to build
  and load it.

### CV upload + answer bank

- **Real CV upload + parsing** — upload a PDF/DOCX in Settings → it's stored in a
  **private** Supabase Storage bucket (`cvs`) and the text is extracted
  (`unpdf` / `mammoth`) to ground generated content. CV files never go to the
  browser/extension except via short-lived signed URLs.
- **Answer bank** — reusable Q&A that grows as you apply. A near-identical
  question reuses your saved answer verbatim; otherwise the copilot generates one
  you can edit and save.

### Required env (optional features)

The app runs without these — the copilot degrades gracefully and tells you when a
piece isn't configured:

```env
ANTHROPIC_API_KEY="sk-ant-..."                 # AI generation (server-only)
SUPABASE_URL="https://<ref>.supabase.co"       # CV storage
SUPABASE_SERVICE_ROLE_KEY="..."                # CV storage (server-only; bypasses RLS)
```

## Data & ingestion

The seed data is a curated, **original** dataset
(`src/ingestion/datasets/uk-finance-2027.ts`) for the summer-2027 cycle:
~24 employers and ~45 opportunities spanning every in-scope role family, with a
realistic mix of statuses, locations, deadlines and sponsorship flags.

The ingestion pipeline (`src/ingestion/`) is built to extend:

- `normalize.ts` maps raw records to a normalized shape with a parse-confidence
  score.
- `import.ts` is an idempotent upsert pipeline (employers → opportunities →
  tags/sources) wrapped in an `IngestionRun` record.
- `adapters/` contains typed **interface stubs** for Greenhouse, Lever and
  Workday implementing a common `SourceAdapter`, so real ATS ingestion can plug
  in later without touching the rest of the app. **No live scraping is
  implemented** — and the product uses original summaries to avoid copying
  protected content.

Re-run `npm run seed` any time; it updates existing rows rather than
duplicating.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (also runs `prisma generate`) |
| `npm run start` | Start the production server |
| `npm run test` | Run the Vitest suite |
| `npm run db:migrate` | Run Prisma migrations (`migrate dev`) |
| `npm run db:push` | Push schema without a migration |
| `npm run db:studio` | Open Prisma Studio to inspect data |
| `npm run seed` | Seed opportunities, employers and the demo user |
| `npm run lint` | Lint |

### Inspecting seeded data

Use `npm run db:studio` (Prisma Studio) to browse `Employer`, `Opportunity`,
`MatchScore` and `IngestionRun` tables in a GUI.

---

## Testing

```bash
npm run test
```

Covers:

- **Scoring** (`src/test/scoring.test.ts`) — perfect-fit, determinism, role/
  timing/location weighting, the visa-sponsorship penalty, and clamping.
- **Filtering & sorting** (`src/test/filters.test.ts`) — param parsing, search,
  status/location/family filters, deadline availability, and every sort key
  (incl. nulls-last and best-match).
- **Validation** (`src/test/validation.test.ts`) — auth and onboarding Zod
  schemas, including the "location required unless open to anywhere" rule.

---

## Deployment (Vercel + Supabase)

1. Push this repo to GitHub.
2. Import it into [Vercel](https://vercel.com) (framework auto-detected as
   Next.js).
3. Add environment variables in **Vercel → Project → Settings → Environment
   Variables**: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, and `AUTH_URL`
   (set `AUTH_URL` to your production URL, e.g. `https://your-app.vercel.app`).
   To enable the apply copilot, also add `ANTHROPIC_API_KEY`, `SUPABASE_URL`, and
   `SUPABASE_SERVICE_ROLE_KEY` (the app runs without them; the copilot just stays
   disabled until they're set).
4. Deploy. After the first deploy, run migrations against the production DB
   (locally with prod env, or via a one-off command):
   ```bash
   npm run db:migrate
   npm run seed
   ```

The app is serverless-safe: it uses the pooled Supabase connection at runtime
and JWT sessions (no server-side session store).

---

## License / attribution

Original work. Employer names are referenced for identification only; this
product is not affiliated with, endorsed by, or sourced from any listed
employer or third-party tracker.
