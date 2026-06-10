# Manual tasks — things only you can do

Living checklist, updated by every Cyclops work session. Items are ordered;
some gate others. Check them off as you go.

## Gate A — required before /chat and /memory work at all

- [ ] **Apply the additive SQL to Supabase** (Supabase SQL editor, or
  `! npx prisma db execute --file <file>` one at a time), in this order:
  1. `prisma/sql/2026-06-09-cyclops-memory.sql`
  2. `prisma/sql/2026-06-09-pgvector.sql` (needs the `vector` extension enabled)
  3. `prisma/sql/2026-06-10-cyclops-phase2.sql` (created in phase 2)
  All files are CREATE-only; nothing existing is altered.
- [ ] **Set env vars** in `.env` AND Vercel (after the SQL):
  `VOYAGE_API_KEY=<from voyageai.com>` and `CYCLOPS_DAILY_TOKEN_BUDGET=2000000`.

## Gate B — before merging `cyclopslevelup` to main (main auto-deploys prod)

- [ ] **Smoke test on localhost** (after Gate A):
  - `/chat`: "I got a first in my securities module, remember that" → expect a
    "saving to memory" chip with an expandable diff; check `/memory` history.
  - `/chat`: press Stop mid-tool-call, then send another message (must not error).
  - `/memory`: edit profile.md → Save → Restore a version.
  - Extension: one autofill + one generated answer on a Greenhouse test page
    (responses should look unchanged from before).
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
- [ ] **Vercel cron** (phase 4): after merging, confirm the cron entries in
  `vercel.json` appear under Vercel → Settings → Cron Jobs.
- [ ] **Reload the unpacked extension** after phases 2–4 (`extension/`:
  `npm run build`, then chrome://extensions → Reload). Extension icons still
  needed before any Web Store submission.

## Done

- [x] 2026-06-09 — Phase 1 (memory core + chat) implemented and reviewed on
  `cyclopslevelup`.
