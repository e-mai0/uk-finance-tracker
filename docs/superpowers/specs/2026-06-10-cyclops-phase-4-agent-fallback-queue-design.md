# Cyclops Phase 4 — Agent Fallback + Queue (mini-spec)

Parent spec: `2026-06-09-cyclops-application-os-design.md` §3 (seam reserved), §9
phase 4. This mini-spec is the "detailed design deferred to its own spec" that
the parent requires before phase-4 code.

**Date:** 2026-06-10. **Branch:** `cyclopslevelup`.

## 1. Goal and scope

Three subsystems, all additive, no schema changes:

1. **Agent page-driving fallback** — when the deterministic plan leaves
   unresolved fields (asks) or recognises nothing on an unknown ATS, the user
   can invoke a bounded, confirmation-gated agent loop that proposes values
   for those fields from their memory and profile.
2. **Overnight prep queue + morning brief** — a daily cron refreshes employer
   research for deadline-near tracked opportunities and writes a deterministic
   morning-brief chat thread per user.
3. **Gardener cron** — the periodic trigger for the existing memory gardener
   (parent spec §5.5), which until now only ran opportunistically after chat
   turns.

Out of scope (explicitly): arbitrary `click` actions, auto-submit, file
uploads, multi-page wizard navigation beyond re-serialise rounds, email/push
delivery of the brief, LLM-written brief prose.

## 2. Agent page-driving fallback

### 2.1 Shape: request/response rounds, not a streaming session

The extension drives a loop of discrete HTTPS calls instead of holding a
streaming tool session. Reasons: MV3 service-worker lifetime is unreliable for
long streams; discrete rounds are auditable, budget-meterable, and trivially
resumable; and the confirmation checkpoint (user approves before anything is
written to the page) sits naturally between rounds.

The parent spec names `read_page` / `fill_field` / `click` as extension tools.
In this design they exist as protocol roles, not LLM-streamed tool calls:
`read_page` = the serialized field list the extension sends each round;
`fill_field` = the proposed actions the server returns; `click` is deferred
(out of scope) because value-writing covers the unresolved-required-fields
goal without the risk surface of arbitrary clicking.

### 2.2 Endpoint: `POST /api/ext/agent`

- Auth: `requireToken` (same as all `/api/ext/*`).
- Validation: zod `extAgentRequestSchema` in `src/lib/validation.ts`:
  - `fields`: array (max 60) of `{ fieldId, label (≤300), kind, options?
    (array of strings, max 40, each ≤200), currentValue? (≤2000),
    required?: boolean }` — the extension's existing serializer output, plus
    current values.
  - `context`: `{ employer?: string, role?: string, url?: string }` (each
    bounded).
  - `round`: int 1..3. Round cap enforced server-side AND client-side.
- Budget: `checkBudget(userId)` → 429 `{ error }` when over (same shape as
  `/api/ext/answer`); `recordUsage` after the call.
- One LLM call per round: `generateObject` on `SONNET_ID` with output schema
  `{ actions: [{ fieldId, value, reason, confidence: "high"|"medium"|"low" }],
  unresolved: [{ fieldId, question }], done: boolean }`.
- Grounding: the prompt embeds, in `<reference>` data-not-instructions framing
  (reuse `escapeReference` from the engine), (a) the user's field map from
  `buildFieldMap`, (b) `profile.md` fact lines, (c) top answer-bank matches
  for the unresolved labels (reuse `suggestForLabels` inputs). Anti-fabrication
  rule identical to the engine's: a value must appear in or follow directly
  from the reference material; otherwise the field goes to `unresolved` with a
  question for the user.
- Server-side action validation (fail closed): drop any action whose
  `fieldId` is not in the submitted `fields`; drop values for fields whose
  `kind` is file/submit-like; for option fields, drop values not present in
  `options` (case-insensitive match allowed, return the canonical option).
  Validation is a pure function (`src/server/agent/validate.ts`) with unit
  tests.
- Response: `{ actions, unresolved, done, round }`.

### 2.3 Extension UX (confirmation checkpoint)

- Panel: when the applied plan leaves ≥1 ask unanswered OR the plan matched 0
  fields, the footer shows `Agent assist ▸`. Strictly user-initiated; never
  auto-fires (no surprise token spend; mirrors the prestage budget lesson).
- On click: serialize current field state, POST round 1, render the proposed
  actions as a review list: label, proposed value (truncated), reason,
  uppercase confidence chip — same chip language as suggestions. Buttons:
  `Apply all`, per-row `apply` / `skip`. Nothing touches the page until the
  user applies. Applying uses the existing `setFieldValue` path.
- After applying, if `done` is false and unresolved fields remain, a
  `Continue ▸` affordance sends round 2 (re-serialised page). Hard stop after
  round 3 with a "hand back to you" message listing what is still unresolved.
- `unresolved[].question` items render exactly like ask items (the user
  answers; existing fact persistence applies).
- Old-server degradation: the button only renders when the endpoint
  responds; a 404 from an old server shows the panel's standard failure line.

### 2.4 Safety invariants

- Never auto-submit; submit/button/file fields are excluded from both the
  serialized request (existing serializer already targets inputs) and the
  validated actions.
- The agent writes nothing without an explicit user apply.
- Round cap 3, action cap = number of submitted fields, value length cap
  2000, all enforced server-side.

## 3. Overnight prep queue + morning brief

### 3.1 Cron entry: `GET /api/cron/overnight`

- Schedule: daily 05:30 UTC via `vercel.json` crons.
- Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel sends this
  automatically when the env var is set). Constant-time compare; 401
  otherwise. Local/manual runs can call it with the header.
- Per run: iterate users who have ≥1 application or saved opportunity
  (bounded `take: 200`).

### 3.2 Prep work (research only — no speculative drafts)

For each user: tracked/saved opportunities with `deadlineAt` within the next
7 days and no SUBMITTED/OFFER application, capped at 5 per user per night.
For each, `ensureEmployerResearch(employerId)` (already stampede-guarded and
14-day-fresh) gated by `checkBudget(userId)` — over-budget users are skipped,
not queued. Drafts are NOT pre-generated overnight: real form questions are
unknown until a page is opened, and panel-v2 prestaging already covers the
on-page moment. The queue's value is warm research + the brief.

### 3.3 Morning brief (deterministic, zero LLM)

- Composed by a pure function `composeBrief(data, today)` in
  `src/server/brief/compose.ts` from: deadlines ≤3 days (urgent) and ≤7 days,
  research refreshed overnight, pending gardener questions (count + first
  question), stale applications (same staleness rule the chat brain uses).
  Plain markdown, hyphens only, no em dashes. Returns `null` when there is
  nothing to say (no spam).
- Delivery: a chat thread titled `Morning brief - YYYY-MM-DD` containing one
  assistant `ChatMessage` whose `parts` JSON is
  `[{ "type": "text", "text": <brief> }]` (matches `rowToUIMessage`).
  Idempotent: if a session with that title already exists for the user, skip.
  Appears at the top of the chat rail like any thread; no new UI.

## 4. Gardener cron: `GET /api/cron/gardener`

- Schedule: daily 06:00 UTC. Same CRON_SECRET auth.
- Iterate users (bounded `take: 200`), `gardenerDue(userId)` → cap of 20
  gardener runs per invocation (Haiku cost + duration bound);
  `runGardenerForUser` already records GardenerRun and fails closed.

## 5. Deployment config

- New `vercel.json` at repo root with the two cron entries. (vercel.ts is the
  newer option; vercel.json is sufficient for two crons and adds no
  dependency.)
- Cron routes: `runtime = "nodejs"`, `dynamic = "force-dynamic"`,
  `maxDuration = 300`.

## 6. Manual tasks (feed docs/MANUAL-TASKS.md)

- Set `CRON_SECRET` (random ≥32 chars) in `.env` + Vercel.
- After merge: confirm both cron jobs appear under Vercel → Settings → Cron
  Jobs (existing Gate C item).
- Rebuild + reload the unpacked extension (agent assist UI).

## 7. Testing

- Unit (Vitest): `validateActions` (unknown fieldId dropped, non-option value
  dropped, canonical option casing returned, submit/file kinds dropped, caps),
  `composeBrief` (urgent vs week buckets, empty → null, gardener question
  inclusion, no em dashes), cron auth helper (bad/missing secret).
- Route/LLM layers stay thin; engine-style DI where cheap (composeBrief takes
  plain data, not prisma).
- Manual smoke (Gate B): agent assist on a Greenhouse test page with an
  intentionally unknown field; `curl` both cron routes with the secret.

## 8. Risks

- **Token burn**: agent loop is user-initiated, round-capped, budget-gated;
  overnight queue is research-only, per-user capped, budget-gated. Brief is
  free (deterministic).
- **Page-write safety**: nothing is written without user confirmation;
  server validates every action against the submitted page.
- **Cron stampede / duplication**: title-idempotent brief; research layer
  already has an inflight guard and freshness window.
