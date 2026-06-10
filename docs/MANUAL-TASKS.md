# Manual tasks — things only you can do

Living checklist, updated by every Cyclops work session. Items are ordered;
some gate others. Check them off as you go.

## Gate A — required before /chat and /memory work at all

- [x] **Apply the additive SQL to Supabase** — applied via MCP 2026-06-10:
  1. `prisma/sql/2026-06-09-cyclops-memory.sql`
  2. `prisma/sql/2026-06-09-pgvector.sql`
  3. `prisma/sql/2026-06-10-cyclops-phase2.sql`
- [x] **Set env vars** in `.env` AND Vercel — done 2026-06-10:
  `VOYAGE_API_KEY`, `CYCLOPS_DAILY_TOKEN_BUDGET=2000000`.
- [x] **Set `CRON_SECRET`** in `.env` AND Vercel — done 2026-06-10.

## Gate B — before merging `cyclopslevelup` to main (main auto-deploys prod)

- [ ] **Smoke test on localhost** (after Gate A):
  - `/chat`: "I got a first in my securities module, remember that" → expect a
    "saving to memory" chip with an expandable diff; check `/memory` history.
  - `/chat`: press Stop mid-tool-call, then send another message (must not error).
  - `/memory`: edit profile.md → Save → Restore a version.
  - Extension: one autofill + one generated answer on a Greenhouse test page
    (responses should look unchanged from before).
- [ ] **Reload the unpacked extension** (extension/: `npm run build`, then
  chrome://extensions -> Reload), then smoke the panel v2 flow on a Greenhouse
  test page: suggestions on ask fields (provenance + confidence chip), prestaged
  drafts (max 3, sequential), draft provenance line, Different story button,
  thin-grounding warning, Discuss in Cyclops link.
- [ ] **Agent assist**: on a Greenhouse test page with an unknown field, click
  Agent assist. Proposals must render for review and NOTHING fills before you
  click apply; round cap is 3; a budget error renders if over budget.
- [ ] **Cron routes**:
  `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/gardener`
  and the same for `/api/cron/overnight` (or via `!` commands) return JSON,
  401 without the header.
- [ ] **Judge the writing eval** (phase 2): open `src/eval/REPORT.md` after the
  eval run, score old vs new drafts against the rubric. **This is the spec's
  kill-gate** — if the new drafts don't clearly sound more like you, we iterate
  on the engine before phase 3 features matter.
  Judging now includes a mandatory **faithfulness check** (rubric dim 5): any
  invented specific (number, name, event not in the fixtures) is an automatic
  loss for that draft. The LLM pre-judge (Haiku) is a pre-filter only — judge
  failures are excluded from totals and do not count as verdicts. Last eval
  rerun: 2026-06-10.
- [ ] Optional: backfill embeddings for existing answers/drafts:
  `! npx tsx scripts/backfill-embeddings.ts`

## Gate C — deploy-time

- [ ] **Rotate two secrets** (pre-existing TODO, now load-bearing because real
  users are the target): `ANTHROPIC_API_KEY` and the Supabase `service_role`
  key were pasted in chat once. Regenerate; update `.env` + Vercel.
- [ ] **Vercel cron** (phase 4): after merging, confirm BOTH cron jobs from
  `vercel.json` appear under Vercel → Settings → Cron Jobs: overnight at
  05:30 UTC and gardener at 06:00 UTC.
- [ ] **Reload the unpacked extension** after phases 2–4 (`extension/`:
  `npm run build`, then chrome://extensions → Reload). This also picks up the
  Agent assist UI in the panel. Extension icons still needed before any
  Web Store submission.

## Phase 3 resumed and completed (2026-06-10)

The pause was temporary: the Claude monthly spend limit was raised and phase 3
resumed and completed the same day
(plan: `docs/superpowers/plans/2026-06-10-cyclops-phase-3-apply-v2.md`).
Tasks 3-6 are done and logged in the Done section below. Phase 4 is also done
(see Done). Remaining: only the user gates (A/B/C above) and the merge to main.

## Done

- [x] 2026-06-09 — Phase 1 (memory core + chat) implemented and reviewed on
  `cyclopslevelup`.
- [x] 2026-06-10 — Phase 2 (writing engine, employer research, draft-edit
  learning, outcome tools, eval harness run twice) implemented and reviewed.
- [x] 2026-06-10 — Phase 3 Tasks 1–2 implemented (214 tests green).
- [x] 2026-06-10 - Phase 3 Task 3 - outcome distillation: story strength/failure
  signals + a superseding strategy.md observation line, triggered by status changes.
- [x] 2026-06-10 - Phase 3 Task 4 - chat deep links (/chat?opportunity= and
  ?prefill= with empty-thread reuse + seeded titles) + tracker "Ask Cyclops" affordance.
- [x] 2026-06-10 - Phase 3 Task 5 - extension panel v2: suggestion provenance
  chips, thin-grounding warning, sequential prestaged drafts (max 3) with
  dirty-text + in-flight guards, Different story button, Discuss in Cyclops link.
- [x] 2026-06-10 - Phase 3 Task 6 - verification sweep: 229 tests green; tsc +
  builds clean (web + extension).
- [x] 2026-06-10 - Phase 4 - agent fallback + overnight queue + gardener cron,
  259 tests green, full review chain.
