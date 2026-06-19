# LLM cost & model routing — operator notes

_Last updated 2026-06-19. Decision: **stay on Claude for all roles right now.** No model has been swapped; this document explains what shipped and how to down-route a cheap task later, safely, when you choose to._

## Current state (production = all Claude)

Two stacked PRs make the app cheaper to run **without changing any model**:

- **#54 — prompt caching + grader-loop collapse.** The large static "playbook" system prefix is sent with Anthropic `cache_control`, so on every repeat call (including each pass of the draft→revise loop, and across all users — the prefix is identical) it bills at **0.1× input**. The grader's worst case dropped from 3 Sonnet calls to 2 (`MAX_GRADER_ATTEMPTS = 1`).
- **#56 — model role-seam + eval gate.** `src/server/ai/models.ts` now exposes `modelFor(role)`. Every role **defaults to today's exact Claude model**; nothing is overridden in production.

### Roles and how routing resolves

| Role | Default (today) | Overridable via | Notes |
|---|---|---|---|
| `draft` | claude-sonnet-4-6 | `MODEL_DRAFT` | writing core — keep on Claude; override is for **eval only** |
| `chat` | claude-sonnet-4-6 | — (pinned) | not overridable by design |
| `agent` | claude-sonnet-4-6 | — (pinned) | not overridable by design |
| `research` | claude-sonnet-4-6 | — (pinned) | not overridable by design |
| `grader` | claude-sonnet-4-6 | `MODEL_GRADER` | down-route candidate (Part 3) |
| `critique` | claude-haiku-4-5 | `MODEL_CRITIQUE` | down-route candidate (Part 3) |
| `distill` | claude-haiku-4-5 | `MODEL_DISTILL` | down-route candidate (Part 3) |
| `gardener` | claude-haiku-4-5 | `MODEL_GARDENER` | down-route candidate (Part 3) |
| `cvFacts` | claude-haiku-4-5 | `MODEL_CV_FACTS` | down-route candidate (Part 3) |

`modelFor` keeps Claude ids on the **direct Anthropic provider** (so prompt caching keeps working) and routes any non-Claude id (e.g. `google/gemini-2.5-flash-lite`) through the **Vercel AI Gateway**. **Production leaves every `MODEL_*` unset** → all Claude. The seam is inert until you set one.

## Why we are NOT swapping the writing core

Research (see `.agent/DECISIONS.md` ADR-008 and `.agent/rfcs/llm-cost-reduction.md`): nuanced British-English writing taste, long-playbook instruction adherence, and multi-step tool reliability are **base-model ceilings** a prompt harness amplifies but cannot manufacture. Cheaper/open models close the gap on JSON/extraction/single tool-calls, not on the writing that is the product's differentiator. So the writing/chat/agent/research roles stay on Claude; only the cheap structured roles are down-route candidates — and only after a measured eval says they pass.

## How to down-route a cheap task later (Part 3 — deferred, gated)

**Do not do this casually.** Three prerequisites first:

1. **GDPR / sub-processor sign-off.** Routing through the Gateway to a non-Anthropic model adds a sub-processor that may see student CV/profile PII. Pick a **Western, GDPR-clean** provider with a DPA and no-training default — **Gemini 2.5 Flash-Lite** (bucket-4 extraction) or **GPT-5-mini** (grader). **Never** route PII to a first-party Chinese API (DeepSeek/Kimi/Qwen/GLM = China jurisdiction, train on inputs); if you ever use those, only via a Western host with Zero-Data-Retention. Verify exact model ids/prices against the live Gateway catalog (they churn).
2. **Account credit** on Anthropic (the eval needs live Claude calls) **and** an `AI_GATEWAY_API_KEY` (for the candidate).
3. **Run the eval and require a PASS.**

### Running the eval

```bash
# Compare a candidate against Claude on the real draft fixtures.
EVAL_ROLE=draft EVAL_CANDIDATE_MODEL=google/gemini-2.5-flash-lite \
  npx tsx scripts/eval-writing.ts          # add --dry-run to validate wiring without API calls
# Output: src/eval/REPORT.md  (quality vs Claude + indicative cost + PASS/FAIL)
```

The gate (`src/eval/gate.ts`) is **quality-first**: the judge stays on frontier Claude (never the candidate, to avoid self-preference), and a cheaper-but-worse candidate can never PASS — a cost win never overrides a quality or pairwise regression.

### Rollout if it PASSES

1. Set the one env var in a **preview/staging** deployment only: e.g. `MODEL_GARDENER=google/gemini-2.5-flash-lite`.
2. Canary on a small % of traffic; watch refusal rate, latency, output quality.
3. **Kill-switch = unset the env var** → instantly back to Claude (no deploy of code needed).
4. Migrate the cheapest/lowest-risk roles first (`gardener`/`cvFacts`/`distill`), then `critique`, then trial `grader`. **Leave the writing/chat/agent/research roles on Claude.**

## Open follow-up

- **Confirm the cache actually hits live** once the Anthropic account is credited: run a real draft and check `providerMetadata.anthropic.cache_read_input_tokens > 0` on the 2nd call. The cache-control placement is verified at the wire level; only the live read is pending (the review hit "credit balance too low").
- The eval's cost column is an indicative length-based estimate (it does **not** affect the PASS/FAIL decision, which is quality-only).
