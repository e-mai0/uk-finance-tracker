# Trackr — UK Finance Summer Internship Tracker

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
- **Opportunity detail** — full normalized metadata, a scoring breakdown, and
  apply/source links.
- **Settings** — edit your profile and preferences; scores recompute on save.

### Scope

In scope: UK finance summer internships across investment banking, sales &
trading / markets, asset management, private equity / credit, hedge funds,
quant, corporate banking and research.

Intentionally **out of scope** for this MVP: browser copilot / automation,
auto-apply, live scraping / ATS integrations (interface stubs only), spring
weeks, graduate roles, placements, consulting, general tech roles, employer-side
tooling, real CV upload/parsing (metadata placeholder only), and ML-based
matching.

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
