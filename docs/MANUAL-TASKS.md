# Manual tasks — things only you can do

Living checklist, updated by every Cyclops work session. Items are ordered;
some gate others. Check them off as you go.

## Gate D — GB+ UI revamp (LIVE in prod 2026-06-11; these unlock its data)

- [ ] **Apply the two additive SQL files to Supabase** (SQL editor, in order —
  everything degrades gracefully until then, but badges/queue/radar stay empty):
  1. `prisma/sql/2026-06-11-attention-items.sql` — attention store (nav badges,
     Today queue, dock badge, draft-review items)
  2. `prisma/sql/2026-06-11-radar-ingestion.sql` — radar ingestion tables
     (from the parallel Radar session; skip if that session already ran it)
- [ ] **Smoke the new UI on prod or localhost** (after the SQL):
  - `/today`: brief card appears the morning after the next overnight cron;
    queue actions (Dismiss / later / Answer in chat) clear items and the nav
    badge counts drop everywhere at once.
  - Tracker: ticker tape on top; J/K/⏎/S/A keys; COMPACT/COMFY toggle persists;
    ★ Saved filter; ⏎ opens the listing peek; "Start application" creates a
    DRAFT and lands on /applications.
  - Dock: ◆ edge tab → docked rail → ⌘J (Ctrl+J) expands; Ctrl+\ hides; Esc
    docks; suggestions send; "Open in Ask Cyclops →" carries the thread.
  - ⌘K palette: type 2+ chars → listings + conversations; arrows + Enter.
  - /applications → open one → status stepper + draft Accept (check the answer
    lands in Settings → Answer bank) + Skip.
  - /activity shows the agent's recent actions.
- [ ] **Verify all THREE Vercel crons** under Vercel → Settings → Cron Jobs:
  overnight 05:30 UTC, gardener 06:00 UTC, ingest/sync 07:00 UTC.
- [ ] **Rotate two secrets** (carried from Gate C, still open):
  `ANTHROPIC_API_KEY` and the Supabase `service_role` key were pasted in chat
  once. Regenerate; update `.env` + Vercel.
- [ ] **Reload the unpacked extension** if you haven't since the universal-forms
  merge (extension/: `npm run build`, then chrome://extensions → Reload).
  Extension icons still needed before any Web Store submission.

## Slack — "PR logs" channel notifications

- [ ] **Create a Slack Incoming Webhook** for the PR-logs channel
  (Slack → Apps → *Incoming Webhooks* → Add to the channel → copy the URL).
- [ ] **Add it as a GitHub Actions secret** named `SLACK_PR_WEBHOOK`
  (repo → Settings → Secrets and variables → Actions → New repository secret).
  Until this exists, `.github/workflows/slack-pr-notify.yml` no-ops with a
  warning — it never fails CI.
- [ ] **Smoke test**: open a test PR against `main` → a "PR opened" message
  should land in the channel; when CI finishes you get a pass/fail message;
  merging posts "PR merged". (Fork PRs get no message — secrets aren't shared
  with forks; CI-result messages still post since they run in the base repo.)

## Slack — daily status digest (#daily-status-check, 6am UK)

`.github/workflows/daily-status.yml` posts a 4-section digest (site status /
yesterday's PRs / running tasks / things to work on) every morning at 6am UK.
Section 4 ("things to work on") is written by the Cyclops **state-assessor**
agent running headless in CI via `anthropics/claude-code-action`; without an AI
credential — or if that step fails — it falls back to mechanical content (CI
status + open issues + manual to-dos), so the digest never fails just because
the credential is absent.

- [x] **Create the `#daily-status-check` channel** in Slack — exists (verified
  2026-06-19, channel `C0BBNRLA67M`).
- [ ] **Create an Incoming Webhook** bound to `#daily-status-check`, copy the
  URL.
- [ ] **Add it as a GitHub Actions secret** named `SLACK_STATUS_WEBHOOK`.
  Until it exists the workflow no-ops with a warning (never fails).
- [ ] **(Optional — enables the agent-written section 4)** Add an AI credential
  as a repo secret: `ANTHROPIC_API_KEY` (metered, pay-per-use) **or**
  `CLAUDE_CODE_OAUTH_TOKEN` (rides a Claude subscription — generate with
  `claude setup-token`). Without it, section 4 uses the mechanical fallback.
  Cost is one short run/day: read-only inspection, ≤12 turns, no test suite;
  swap `--model claude-sonnet-4-6` → `claude-haiku-4-5-20251001` in the
  workflow for a cheaper run. If the agent step errors with an auth/OIDC
  message on the first test, add `id-token: write` to the workflow's
  top-level `permissions:` block.
- [ ] **Merge the workflow to `main`** — scheduled (`cron`) workflows only run
  from the default branch, so the 6am job won't fire until it's on `main`.
- [ ] **Test it now**: Actions → *Daily Status (Cyclops)* → **Run workflow**
  (manual runs skip the 6am gate and post immediately). With an AI credential
  set you'll see the 🤖 agent assessment in section 4; without one, the
  mechanical fallback.

## Done

- [x] 2026-06-09 — Phase 1 (memory core + chat) implemented and reviewed.
- [x] 2026-06-10 — Phase 2 (writing engine, employer research, draft-edit
  learning, outcome tools, eval harness run twice) implemented and reviewed.
- [x] 2026-06-10 — Phase 3 (apply v2: panel provenance, prestaged drafts,
  deep links, outcome distillation) + Phase 4 (agent fallback, overnight
  queue, gardener cron). 259 tests green.
- [x] 2026-06-10 — Gate A: cyclops SQL ×3 applied; VOYAGE_API_KEY, budget,
  CRON_SECRET set in .env + Vercel.
- [x] 2026-06-11 — `cyclopslevelup` merged to main; universal-forms extension
  branch merged (ARIA widgets, clamping, force-engage); Radar ingestion +
  Firm Scout merged.
- [x] 2026-06-11 — **GB+ UI revamp shipped to production in full** (4 plans,
  ~30 commits, 407 tests): design tokens + fonts + shell, attention store +
  live badges, dense tracker board (tape kept on top) + listing peek +
  ★ filter, the Cyclops dock, real Today (brief/queue/coming-up), draft
  review → answer bank, applications pipeline + workspace, memory gardener
  questions, settings permissions, /activity, ⌘K palette, a11y/idiom sweeps.
  Spec: `docs/superpowers/specs/2026-06-11-cyclops-gbplus-ui-design.md`.
