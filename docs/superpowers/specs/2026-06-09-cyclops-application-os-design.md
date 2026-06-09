# Cyclops — AI Application OS — Design Spec

**Date:** 2026-06-09
**Status:** Approved direction, pending final user review
**Branch:** `cyclopslevelup`

## 1. Vision

Cyclops turns the UK finance tracker from "another autofill extension" into an
application OS: an assistant that deeply knows one domain — **the user and their
applications** — the way Granola knows your meeting notes. The moat is not the
agent operating a browser (commoditised by Claude-in-Chrome, ChatGPT agent,
etc.); the moat is:

1. **Accumulated person-model** — voice, stories, answer history, edit-diffs —
   that improves with every application and is painful to leave.
2. **Instant action** — deterministic fill in under a second for known ATSs;
   LLM agents only where determinism stalls.
3. **Zero prompting** — the happy path never requires typing a prompt. One
   button on the page; plain questions when input is genuinely needed.

**Multi-user from day one.** Every feature is built for real signed-up users,
not a personal tool. The existing multi-user schema (Auth.js, per-user rows)
is the foundation; Cyclops features must be userId-scoped, onboardable without
developer involvement, and cost-bounded per user.

## 2. Goals and non-goals

**Goals**

- A chat surface where users teach Cyclops about themselves and discuss any
  listing or application; everything learned persists in visible, editable
  memory.
- Application answers and cover letters that sound like the specific user:
  grounded in their real stories, written in their observed voice, free of AI
  tells (no em dashes, no "I'm excited to", no generic STAR recitation).
- "Never say anything twice": any fact given once — in chat, in an ask panel,
  in onboarding — is remembered and used everywhere.
- One-button apply: deterministic fill + voice-true drafts + plain-question
  asks, with employer research pre-staged.
- Agent fallback for forms determinism can't handle (later phase).

**Non-goals (this spec)**

- Auto-submit. Cyclops never submits an application; submit is always the
  user's click.
- Server-side headless browsing. The user's logged-in browser is the
  execution environment.
- Vector-memory platforms (Mem0/Zep/Letta). Curated markdown memory +
  pgvector retrieval is the chosen architecture.
- Fine-tuning. Voice is achieved by prompting (exemplars + voice file +
  critique-revise), not custom weights.
- Interview prep, email follow-ups, calendar integration (future, post-v1).

## 3. Product surfaces

### 3.1 Tracker (exists, augmented)

The current table stays the home page. Additions:

- Each row gets an "Ask Cyclops" affordance that opens the Chat page with that
  opportunity's context pre-loaded (deep link: `/chat?opportunity=<id>`).
- When a listing is saved/tracked, a background job creates or refreshes
  shared employer research (see §6.3).

### 3.2 Cyclops Chat (new page, `/chat`)

Granola-style: one continuous relationship with threads, not throwaway
sessions.

- **Thread list** (left rail): past conversations, auto-titled. New thread
  button. Threads tied to userId.
- **Chat pane**: streaming chat via AI SDK 6 `useChat`. Tool activity is
  visible as inline status chips ("reading your stories…", "researching
  Barclays…", "saved to memory ✓").
- **Memory transparency**: when Cyclops writes to memory, the message shows a
  diff chip the user can expand, edit, or revert.
- Typical uses: dump new facts ("I got a first in my securities module"),
  fit-check a role, compare deadlines, draft/discuss an answer, review what
  Cyclops knows.

### 3.3 Memory page (new page, `/memory`)

"What Cyclops knows about you": a file browser over the user's memory tree
(§5) with inline editing and per-file history. This is the trust surface —
nothing Cyclops knows is hidden.

### 3.4 Extension: one-button apply (augmented in phase 3)

Current detect → plan → apply → triage pipeline is kept. Changes:

- The triage panel becomes conversational: asks render as plain questions
  ("They ask about a time you led under pressure — you've used the rowing
  story at Goldman before; want the hackathon one instead?") with one-tap
  choices where possible.
- Drafts are produced by the writing engine (§6) instead of bare CV-grounded
  generation.
- Every ask answered and every draft edit writes back to memory.
- A "Discuss in Cyclops" link opens the web chat with the in-progress
  application context.

## 4. Architecture

One agent brain, server-side, shared by chat and extension.

- **Agent loop:** Next.js backend route using **AI SDK 6** (`ai` package,
  `@ai-sdk/anthropic` provider with the existing `ANTHROPIC_API_KEY`).
  Tool-loop agent with a step cap (default 12). Streaming to the web app via
  `useChat`; extension endpoints (`/api/ext/answer`, `/api/ext/plan`) call the
  same internal services (not the HTTP chat route).
- **Models:** `claude-sonnet-4-6` for chat reasoning and drafting;
  `claude-haiku-4-5` for field mapping, critique pass, embeddings-adjacent
  cheap calls. Model names live in one config module.
- **Tools (phase 1–2 set):**
  - `read_memory(path)` / `list_memory(dir)` / `edit_memory(path, edit)` —
    memory-tool pattern; edits produce stored diffs.
  - `search_applications(query)` — user's applications + answer bank +
    generated drafts (pgvector + structured filters).
  - `search_opportunities(query)` — tracker dataset.
  - `fit_check(opportunityId)` — deterministic score + reasons, plus memory
    context, returned for the model to narrate honestly.
  - `draft_text(kind, question, opportunityId?)` — runs the writing engine
    (§6) and returns the draft with provenance (stories used, voice version).
  - `research_employer(employerSlugOrName)` — reads shared research cache,
    triggers refresh when stale (§6.3).
- **Existing deterministic pipeline is untouched as the fast path.** The
  extension fills known fields with zero LLM involvement, exactly as today.
- **Agent page-driving loop (phase 4):** invoked only when the deterministic
  plan leaves unresolved required fields, or on unknown ATSs. Lives behind the
  same brain; extension exposes `read_page` / `fill_field` / `click` as tools
  over the existing message bridge. Out of scope until phase 4; this spec only
  reserves the seam (plan response already distinguishes resolved/unresolved).

## 5. Memory system

### 5.1 Storage

Markdown file tree per user, stored as Postgres rows (not object storage):

```prisma
model MemoryFile {
  id        String   @id @default(cuid())
  userId    String
  path      String   // e.g. "voice.md", "stories/rowing-club.md"
  content   String   @db.Text
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
  revisions MemoryRevision[]
  @@unique([userId, path])
  @@index([userId])
}

model MemoryRevision {
  id           String   @id @default(cuid())
  memoryFileId String
  diff         String   @db.Text  // unified diff
  author       MemoryAuthor       // USER | CYCLOPS
  createdAt    DateTime @default(now())
}
```

### 5.2 Canonical tree

```
profile.md      # facts beyond structured profile: grades, modules, interests, constraints
voice.md        # writing voice: banned tells, observed traits, 3–5 exemplar snippets
strategy.md     # CURRENT direction only + dated history section (see anti-rot, §5.5)
stories/<slug>.md   # one real anecdote per file — structured schema below
companies/<slug>.md # user's personal angle on an employer: why-them, contacts,
                    # past answers given, interview history
```

**Structured markdown, not freeform prose.** Pure prose degrades after dozens
of edits and retrieves poorly. Every memory file carries YAML frontmatter;
prose is confined to designated sections. Stories use a fixed schema:

```markdown
---
title: Rowing club treasurer turnaround
themes: [leadership, teamwork, pressure]
employers_used:
  - { employer: goldman-sachs, date: 2026-10-02, question_kind: leadership }
strength_signal: high     # how well this story has landed (outcome-informed, §6.4)
failure_signal: null      # known weaknesses ("reads junior for VP-level qs")
timeline: 2024-09..2025-06
confidence: high          # how sure Cyclops is the details are accurate
last_confirmed: 2026-06-09
---
## Raw notes
<user's own words, never rewritten by Cyclops>
## Final versions
<polished tellings actually used, one per question_kind>
```

`profile.md` and `strategy.md` use sectioned fact lists where each fact line
carries `(confidence: high|medium|low, confirmed: YYYY-MM-DD)`. Retrieval
filters on frontmatter (themes, employers_used, signals) before any
embedding search — structured fields first, vectors second.

Seeded at onboarding (§7); grown by chat, ask-panel answers, and edit-diff
distillation. Structured data (ApplyProfile, AnswerBankItem, Application)
remains in existing tables; memory files hold understanding, not field values.
The fact-save flow (`/api/ext/fact`) keeps writing structured fields AND now
appends notable facts to `profile.md`.

### 5.3 Retrieval

- Memory files are small and curated: `profile.md`, `voice.md`, `strategy.md`
  are loaded into every brain call's system context (token-bounded; if over
  budget, Cyclops is prompted to compact them — the files are the budget).
- Stories and companies load on demand via tools.
- **pgvector** (Supabase, `vector` extension; Prisma `Unsupported("vector")`)
  over: answer bank items, generated drafts, chat messages (user turns only).
  Powers `search_applications` semantic recall ("how did I answer commercial
  awareness questions before?"). Embeddings computed on write with Voyage AI
  `voyage-3.5-lite` (Anthropic's recommended embeddings partner; new
  `VOYAGE_API_KEY` env var) behind a single `embed(texts)` module so the
  vendor is swappable.

### 5.4 Trust rules

- Every Cyclops-authored memory edit stores a revision with a diff and shows
  as a diff chip in chat; user can revert from chat or `/memory`.
- User edits always win; Cyclops never overwrites a user revision silently.
- No memory content is ever shared across users. Only §6.3 employer research
  (containing zero user data) is shared.

### 5.5 Anti-rot: supersession, freshness, and the gardener

**Memory corruption is the project's #1 risk** — bigger than agent
reliability. Memory does not improve monotonically; it rots. A user says "I'm
interested in macro investing", later "actually software PE", later "no,
quant research". Append-only files turn `strategy.md`, `voice.md`, and
stories into contradictory sludge. Defences, all mandatory in phase 1:

- **Supersede, don't append.** The memory-editing prompt requires that new
  information contradicting an existing fact REPLACES it in the live file;
  the old fact moves to the file's dated history section (strategy.md) or
  lives only in MemoryRevision history. Live files contain only current
  truth. Contradictions Cyclops can't resolve confidently become a question
  to the user, not a second entry.
- **Confidence + freshness on every fact** (schema in §5.2). Inferred facts
  start `confidence: medium`; user-stated facts `high`; anything restated or
  confirmed bumps `last_confirmed`.
- **Volatility classes.** `strategy.md` and interests are volatile (stale
  after 30 days unconfirmed); biography and stories are stable (180 days).
  Stale volatile facts decay to `confidence: low` automatically.
- **Memory gardener job.** Periodic per-user pass (cron, and after every 10
  Cyclops memory edits): Haiku scans the tree for contradictions, duplicates,
  stale volatile facts, and over-budget files; proposes consolidation as a
  normal diffable revision; and queues at most 2–3 confirmation questions
  that Cyclops asks naturally in the next chat ("In March you said quant
  research — still the focus?"). Never silently deletes user-authored raw
  notes.

### 5.6 Uncertainty surfacing

Cyclops will sometimes hallucinate memory links; it must expose uncertainty
rather than assert. Required behaviours:

- Memory tools return confidence/freshness with every fact; the system prompt
  forbids asserting `medium`-or-below memory as flat fact. Bad: "You usually
  use rowing here." Good: "You've previously used rowing for teamwork
  questions (confidence: medium) — right?"
- Low-confidence memory is never silently used in a draft; it is either
  confirmed in-flow (one plain question) or omitted.
- Chat and panel render a small confidence chip next to recalled facts and on
  draft provenance ("based on: rowing story (high), your PE interest
  (low — confirm?)").

## 6. Writing engine

Pipeline for every generated draft (form answer, cover letter, chat draft):

1. **Substance gathering** — retrieve: relevant stories (theme-matched,
   excluding ones already used at this employer per usage log), the user's
   `companies/<slug>.md`, shared employer research, the question's nearest
   past answers (pgvector), structured profile.
2. **Voice-constrained generation** — Sonnet call with: `voice.md` (banned
   tells + traits), 3–5 few-shot exemplars of the user's real writing
   (stored in voice.md), substance pack, and hard rules: British English,
   no em dashes, contractions allowed, vary sentence length, one concrete
   detail per paragraph, never invent facts.
3. **Critique-revise pass** — Haiku call scores the draft against voice.md
   and a global AI-tells blacklist (em dashes, "I'm excited", "proven track
   record", "delve", symmetric triads, uniform sentences…); one revision if
   any check fails. Provenance (stories used, checks failed/fixed) is stored
   on the GeneratedDraft.
4. **Learning loop** — when the user edits a draft before inserting (panel or
   chat), store the edit:

```prisma
model DraftEdit {
  id         String   @id @default(cuid())
  userId     String
  draftId    String   // GeneratedDraft
  original   String   @db.Text
  edited     String   @db.Text
  createdAt  DateTime @default(now())
  distilled  Boolean  @default(false)
  @@index([userId, distilled])
}
```

   A periodic distillation job (cron, or triggered after N=5 undistilled
   edits) has Haiku summarise edit patterns into proposed `voice.md` updates,
   applied as a normal Cyclops memory revision (diffable, revertible).

### 6.3 Employer research (shared cache)

```prisma
model EmployerResearch {
  id          String   @id @default(cuid())
  employerId  String   @unique  // FK Employer
  content     String   @db.Text // markdown: divisions, culture signals, recent news, common questions
  model       String
  refreshedAt DateTime
}
```

- Created/refreshed by a background job when any user tracks a listing for
  that employer, or on first `research_employer` call; stale after 14 days.
- Generated by a Sonnet call using Anthropic's server-side web search tool
  (`web_search_20250305`) — no extra vendor or scraping infrastructure.
- Contains zero user data, so it is safely shared across all users; the
  user-specific angle lives in their own `companies/<slug>.md`.

### 6.4 Application-outcome learning

Cyclops learns not just what the user says, but what *works*. The existing
`Application.status` lifecycle (AUTOFILLED → SUBMITTED → INTERVIEWING →
OFFER / REJECTED) is the signal; GeneratedDraft and story `employers_used`
logs already record which content went into which application.

- **Ingestion (phase 2):** when a user updates an application's status (web
  app, or Cyclops asks in chat about applications submitted >2 weeks ago),
  the outcome links to the drafts and stories used in it.
- **Distillation (phase 3):** a periodic job correlates outcomes with content:
  story `strength_signal`/`failure_signal` updates, and observations written
  to `strategy.md` ("your asset-management applications progress at 3× your
  IB rate"). At UK-finance sample sizes this is weak evidence — outputs are
  always framed as observations with confidence levels (§5.6), never causal
  claims, and never silently change story selection without provenance
  showing it.
- Story selection in §6 step 1 prefers high-`strength_signal` stories and
  avoids known `failure_signal` matches for the question kind.

## 7. Onboarding additions (multi-user requirement)

Two steps appended to the existing wizard (skippable, nudged later in chat):

1. **Your writing** — paste 1–3 samples of real writing (old cover letter,
   personal statement, long email). Cyclops distils initial `voice.md`
   (observed traits + chosen exemplar excerpts).
2. **Your stories** — Cyclops runs a short guided chat ("tell me about a time
   you led something — just bullet points is fine") and writes the first 2–3
   `stories/*.md` files. CV text seeds candidate story prompts.

If skipped, Cyclops operates with structured profile + CV only and
opportunistically asks for samples/stories in chat ("want this to sound more
like you? paste any old cover letter").

## 8. Multi-tenancy, cost, and safety

- **Scoping:** every new table is userId-scoped with indexes as shown;
  every tool resolves userId from the session (web) or trk_ token (extension).
  No cross-user reads except EmployerResearch.
- **Cost bounds:** per-user daily token budget enforced in the brain service
  (env-configurable; default generous). Tiering: Haiku for all classification/
  critique; Sonnet only for chat reasoning and final drafts. Budget exhaustion
  degrades gracefully: deterministic fill and answer-bank reuse keep working;
  generation returns a clear "daily limit reached" message.
- **Safety/permissions:** Cyclops never submits forms. Memory writes are
  diffable/revertible. Page content sent to the brain is screened server-side
  before reaching tools that can write memory (prompt-injection surface from
  hostile job pages). CV/PII handling unchanged (private bucket, signed URLs).
- **Secrets:** ANTHROPIC_API_KEY and Supabase service key rotation (known
  pre-existing TODO) must happen before any public user onboarding.

## 9. Build phases

Each phase ships independently to real users.

**Phase 1 — Memory core + Chat** *(Cyclops starts knowing you)*
- MemoryFile/MemoryRevision models + migration; memory service (read/edit/
  diff/revert); pgvector setup + embedding-on-write for answer bank and drafts.
- Brain service (AI SDK 6 tool loop) with tools: memory, search_applications,
  search_opportunities, fit_check.
- Structured-markdown schemas, confidence/freshness conventions, supersession
  rules, and the memory gardener job (§5.5) — anti-rot ships WITH the memory
  core, not after it.
- Uncertainty surfacing (§5.6): confidence on tool returns, prompt rules,
  confidence chips in chat.
- `/chat` page (threads, streaming, tool chips, memory diff chips);
  `/memory` page (browse/edit/history).
- Onboarding steps for writing samples and stories.
- ChatSession/ChatMessage models.

**Phase 2 — Writing engine** *(drafts stop sounding like AI)*
- Substance gathering, voice-constrained generation, critique-revise,
  DraftEdit capture + distillation job.
- EmployerResearch model + background refresh job + research tool.
- Rewire `/api/ext/answer` and `draftCoverLetter` through the engine.
- Outcome ingestion (§6.4): status updates link outcomes to drafts/stories
  used; Cyclops nudges for stale application statuses in chat.
- Eval harness: ~20 real application questions, old vs new pipeline,
  user-judged "sounds like me" rubric stored in repo.

**Phase 3 — One-button apply v2** *(never say anything twice)*
- Panel redesign: plain-question asks with suggested answers from memory,
  story-choice prompts, draft provenance display.
- Ask answers and draft edits write back to memory (and structured tables).
- Pre-staged drafts: when a tracked opportunity's apply page is opened and
  the form matches known question patterns, drafts generate immediately.
- Outcome distillation (§6.4): strength/failure signals on stories,
  observation notes in strategy.md, outcome-aware story selection.
- "Discuss in Cyclops" deep link from panel to `/chat`.

**Phase 4 — Agent fallback + queue** *(the long tail)*
- Extension tools (`read_page`, `fill_field`, `click`) over the message
  bridge; brain-driven filling for unresolved fields/unknown ATSs; user
  confirmation checkpoints.
- Deadline-driven overnight prep queue and morning brief.
- Detailed design deferred to its own spec after phases 1–3 ship.

## 10. Testing

- Unit: memory service (CRUD, diffs, revert), question normalisation against
  memory, voice prompt assembly, critique blacklist checks, budget enforcement.
- Integration: brain tool-loop with mocked model (AI SDK test helpers);
  ext endpoints still pass existing 36 tests.
- Eval: phase 2 harness above; re-run on prompt changes.
- Manual: Greenhouse/Lever/Workday smoke flows per phase (existing test pages).

## 11. Risks (ranked)

1. **Memory corruption — the #1 risk.** Contradictory, stale, or hallucinated
   memory destroys trust faster than any missing feature, and a corrupted
   voice.md poisons every draft. Mitigations are §5.5 (supersession,
   confidence/freshness, volatility decay, gardener) and §5.6 (uncertainty
   surfacing) — these ship in phase 1 as part of the memory core, and the
   phase-1 test suite must cover contradiction scenarios explicitly (the
   macro→PE→quant→policy sequence is a named test case).
2. **Voice quality is the product.** The key determinant of differentiation
   is whether users say "this genuinely sounds like me". If phase 2 drafts
   don't clearly beat the current pipeline in the eval, stop and iterate
   there before phase 3 — otherwise Cyclops is another autofill extension
   with a chat tab.
3. **Trust failure UX.** One confidently-wrong recalled "fact" in a submitted
   application is catastrophic for retention; hence no low-confidence memory
   in drafts, ever (§5.6), and visible provenance on everything.
4. **MV3/extension drift:** phase 3 keeps the deterministic path primary, so
   ATS UI changes degrade to today's behaviour, never below it.
5. **Cost:** Sonnet on every draft is the main driver; critique on Haiku and
   answer-bank reuse keep per-application cost in single-digit pennies.

## 12. Execution model: specialist agents

When implementation begins, work is executed by **specialist agents, each
deeply versed in its field before writing code**. Every workstream agent
follows the same contract: (1) study phase — read the relevant spec sections,
current docs for its technology (e.g. `node_modules/next/dist/docs`, AI SDK 6
docs, MV3 docs), and the existing code it touches; (2) produce a short
written design for its slice; (3) implement with tests. The implementation
plan (writing-plans) must assign work along these specialisms:

- **Memory architect** — versed in memory-tool patterns, file-schema design,
  supersession/confidence mechanics, the gardener (§5).
- **Voice & prompt engineer** — versed in style transfer, few-shot exemplar
  pipelines, critique-revise loops, AI-tells; owns voice.md design and the
  writing engine (§6) and the eval harness.
- **Agent-loop engineer** — versed in AI SDK 6 (`ToolLoopAgent`, `useChat`,
  tool streaming); owns the brain service and tools (§4).
- **Extension engineer** — versed in MV3 (service-worker lifecycle, content
  scripts, Shadow DOM); owns panel redesign and write-back flows (§3.4).
- **Data engineer** — versed in Prisma/Postgres/pgvector/Supabase; owns
  migrations, embeddings, outcome ingestion (§5.1, §6.4).
- **Product UX engineer** — owns `/chat`, `/memory`, onboarding additions,
  confidence-chip language (§3, §7), consistent with the existing design
  system.
