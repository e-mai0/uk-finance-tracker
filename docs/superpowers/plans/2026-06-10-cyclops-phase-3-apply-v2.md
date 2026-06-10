# Cyclops Phase 3 — One-Button Apply v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Never say anything twice" on the page: asks arrive pre-answered from memory, drafts pre-stage automatically with visible provenance and story choice, outcomes feed back into story signals and strategy, and every surface deep-links into Cyclops chat.

**Architecture:** No schema changes (story signals live in story frontmatter; observations live in strategy.md). Server gains a pure suggestion matcher wired into `/api/ext/plan`, an `excludeStories` knob on the answer endpoint, and an outcome-distillation module triggered by status changes. The extension panel is upgraded (suggestions, provenance, regenerate-with-different-story, auto-prestage, chat deep link). `/chat` gains `opportunity`/`prefill` params and the tracker gains an "Ask Cyclops" affordance.

**Tech Stack:** unchanged (Next.js fork, AI SDK 6, Prisma 6, MV3 extension, Vitest).

**Spec:** `docs/superpowers/specs/2026-06-09-cyclops-application-os-design.md` §3.1, §3.4, §5.6, §6.4, §9 phase 3.

---

## Specialist assignments

| Tasks | Specialist | Study before coding |
|---|---|---|
| 1–2 | Agent-loop engineer | `src/app/api/ext/plan/route.ts`, `src/lib/form-plan.ts`, `src/lib/answers.ts` (similarity utils), `src/server/memory/facts.ts` (fact-line format written by `/api/ext/fact`), `src/server/engine/stories.ts` |
| 3 | Memory architect | spec §6.4; `src/server/engine/story-usage.ts` (gray-matter round-trip pattern), `src/server/memory/facts.ts` (`applyFact` supersession pattern), `prisma/schema.prisma` (Application/GeneratedDraft) |
| 4 | Product UX engineer | `src/app/(app)/chat/page.tsx` + `cyclops-chat.tsx`, `src/components/tracker/opportunity-table.tsx` |
| 5 | Extension engineer | ALL of `extension/src/content/` (panel.ts, index.ts, autofill.ts, messaging) + `extension/src/background.ts`; the §3.4 UX contract below |
| 6 | Any | whole plan |

## Conventions

Same as phases 1–2 (`@/*` imports, Vitest in `src/test/`, model handles from `models.ts`, userId scoping, additive-only API changes — old extension builds must keep working against the new API and vice versa, commit per green step, breaking-changes Next fork, budget recording on every LLM call). Current baseline: **206 tests green**.

## File structure (end state)

```
src/lib/suggest.ts                       # pure: suggestForLabels(labels, factLines, bankItems)
src/app/api/ext/plan/route.ts            # + suggestions on ask items
src/app/api/ext/answer/route.ts          # + excludeStories passthrough; + provenance in response
src/lib/validation.ts                    # + excludeStories on answer schema
src/server/engine/stories.ts             # selectStories gains excludeSlugs
src/server/engine/draft.ts               # DraftArgs gains excludeStories
src/server/engine/types.ts               # DraftArgs.excludeStories?: string[]
src/server/engine/outcomes.ts            # deriveStorySignal + buildOutcomeObservation + distillOutcomes
src/app/(app)/chat/page.tsx              # ?opportunity= and ?prefill= support
src/app/(app)/chat/cyclops-chat.tsx      # prefill prop
src/components/tracker/opportunity-table.tsx  # "Ask Cyclops" per-row affordance
src/server/ai/tools.ts                   # update_application_status triggers distillOutcomes
src/server/actions/applications.ts       # status change triggers distillOutcomes
extension/src/content/panel.ts           # panel v2
extension/src/content/index.ts           # prestage + suggestion flow + discuss link
extension/src/shared/types.ts            # payload additions
src/test/suggest.test.ts
src/test/outcomes.test.ts
```

---

### Task 1: Suggestion matcher + plan-endpoint wiring (TDD)

**Files:**
- Create: `src/lib/suggest.ts`
- Test: `src/test/suggest.test.ts`
- Modify: `src/app/api/ext/plan/route.ts`

- [ ] **Step 1: Failing tests `src/test/suggest.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { suggestForLabels, type Suggestion } from "@/lib/suggest";

const PROFILE_FACTS = [
  "- Notice period: one month (confidence: high, confirmed: 2026-06-01)",
  "- Preferred office location: London (confidence: high, confirmed: 2026-05-20)",
  "- Dietary requirements: none (confidence: medium, confirmed: 2026-03-01)",
];

const BANK = [
  { questionText: "What is your notice period?", answer: "One month from acceptance." },
  { questionText: "Why do you want to work in markets?", answer: "Because of X and Y." },
];

describe("suggestForLabels", () => {
  it("matches a profile fact by label similarity", () => {
    const [s] = suggestForLabels(["Notice period"], PROFILE_FACTS, []);
    expect(s).toMatchObject({ label: "Notice period", value: "one month", source: "memory", confidence: "high" });
  });

  it("matches an answer-bank item by question similarity", () => {
    const [s] = suggestForLabels(["Please state your notice period"], [], BANK);
    expect(s.source).toBe("bank");
    expect(s.value).toContain("One month");
  });

  it("prefers memory facts over bank answers when both match", () => {
    const [s] = suggestForLabels(["Notice period"], PROFILE_FACTS, BANK);
    expect(s.source).toBe("memory");
  });

  it("returns nothing for unmatched labels", () => {
    expect(suggestForLabels(["Favourite colour"], PROFILE_FACTS, BANK)).toEqual([]);
  });

  it("carries decayed/medium confidence through", () => {
    const [s] = suggestForLabels(["Dietary requirements"], PROFILE_FACTS, []);
    expect(s.confidence).toBe("medium");
  });
});
```

- [ ] **Step 2: Implement `src/lib/suggest.ts`**

```ts
import { parseFactLine } from "@/server/memory/facts";
import { normalizeQuestion, questionSimilarity } from "@/lib/answers";

export type Suggestion = {
  label: string;
  value: string;
  source: "memory" | "bank";
  confidence: "high" | "medium" | "low";
};

const FACT_LABEL_THRESHOLD = 0.5;
const BANK_THRESHOLD = 0.5;

/**
 * Suggest values for unanswered ask labels from profile.md fact lines
 * (format "- <label>: <value> (confidence: ..., confirmed: ...)") and the
 * answer bank. Memory facts win over bank answers. One suggestion per label.
 */
export function suggestForLabels(
  labels: string[],
  profileFactLines: string[],
  bankItems: { questionText: string; answer: string }[],
): Suggestion[] {
  const facts = profileFactLines
    .map(parseFactLine)
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .map((f) => {
      const idx = f.text.indexOf(":");
      if (idx === -1) return null;
      return {
        label: f.text.slice(0, idx).trim(),
        value: f.text.slice(idx + 1).trim(),
        confidence: f.confidence,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const out: Suggestion[] = [];
  for (const label of labels) {
    const norm = normalizeQuestion(label);
    let best: Suggestion | null = null;
    let bestScore = 0;

    for (const f of facts) {
      const score = questionSimilarity(norm, normalizeQuestion(f.label));
      if (score >= FACT_LABEL_THRESHOLD && score > bestScore) {
        best = { label, value: f.value, source: "memory", confidence: f.confidence };
        bestScore = score;
      }
    }
    if (!best) {
      for (const item of bankItems) {
        const score = questionSimilarity(norm, normalizeQuestion(item.questionText));
        if (score >= BANK_THRESHOLD && score > bestScore) {
          best = { label, value: item.answer, source: "bank", confidence: "medium" };
          bestScore = score;
        }
      }
    }
    if (best) out.push(best);
  }
  return out;
}
```

Check `normalizeQuestion`/`questionSimilarity` real signatures in `src/lib/answers.ts` first — if `questionSimilarity` takes raw strings (normalizing internally), call it with raw strings and drop the explicit `normalizeQuestion` calls. Match the actual API.

- [ ] **Step 3: Wire into `/api/ext/plan`** — after the plan is built, for items with action `"ask"`: load the user's `profile.md` (memoryService.read; tree may be unseeded — treat null as no facts) and answer bank (take 100), run `suggestForLabels`, and attach `suggestion` to each ask item in the response (additive field; old extensions ignore it). Keep the endpoint's failure isolation: suggestion errors must not break planning (try/catch → no suggestions).

- [ ] **Step 4: Tests pass, typecheck, commit** `feat(cyclops): memory-backed suggestions for ask fields`

---

### Task 2: excludeStories + provenance in the answer response (TDD on engine bits)

**Files:**
- Modify: `src/server/engine/types.ts` (DraftArgs gains `excludeStories?: string[]`)
- Modify: `src/server/engine/stories.ts` (selectStories opts gains `excludeSlugs?: string[]`)
- Modify: `src/server/engine/draft.ts` (pass through)
- Modify: `src/lib/validation.ts` (answer schema gains `excludeStories: z.array(z.string()).max(10).optional()`)
- Modify: `src/app/api/ext/answer/route.ts` (pass to draftArgs; response gains `provenance` — additive)
- Test: extend `src/test/engine-stories.test.ts`

- [ ] **Step 1:** Failing test — `selectStories` with `excludeSlugs: ["rowing"]` never returns the rowing story even when it's the best theme match; `draftText` with `excludeStories` forwards them (assert via prompt absence in `engine-draft.test.ts`).
- [ ] **Step 2:** Implement: filter `!opts.excludeSlugs?.includes(s.slug)` in selectStories; thread through draft.ts (`excludeSlugs: args.excludeStories`).
- [ ] **Step 3:** Route: schema addition; `draftArgs` gains `excludeStories: d.excludeStories`; the generated response becomes `{ answer, source: "generated", draftId, provenance: result.provenance }` (additive).
- [ ] **Step 4:** Tests pass, commit `feat(cyclops): story exclusion + provenance in answer responses`

---

### Task 3: Outcome distillation (TDD)

**Files:**
- Create: `src/server/engine/outcomes.ts`
- Test: `src/test/outcomes.test.ts`
- Modify: `src/server/ai/tools.ts` (`update_application_status` triggers), `src/server/actions/applications.ts` (status-change action triggers)

- [ ] **Step 1: Failing tests `src/test/outcomes.test.ts`** (pure parts)

```ts
import { describe, expect, it } from "vitest";
import { deriveStorySignal, buildOutcomeObservation } from "@/server/engine/outcomes";

describe("deriveStorySignal", () => {
  it("any positive outcome -> strength high", () => {
    expect(deriveStorySignal([{ status: "INTERVIEWING" }, { status: "REJECTED" }])).toEqual({
      strength: "high",
      failure: null,
    });
  });
  it("2+ rejections, no positives -> failure note, strength untouched", () => {
    const r = deriveStorySignal([{ status: "REJECTED" }, { status: "REJECTED" }]);
    expect(r.strength).toBeNull();
    expect(r.failure).toContain("2 rejected");
  });
  it("small sample -> no change", () => {
    expect(deriveStorySignal([{ status: "REJECTED" }])).toEqual({ strength: null, failure: null });
  });
});

describe("buildOutcomeObservation", () => {
  it("needs at least 4 settled applications", () => {
    expect(buildOutcomeObservation([{ status: "REJECTED" }, { status: "OFFER" }], "2026-06-10")).toBeNull();
  });
  it("summarises progression with low confidence", () => {
    const apps = [
      { status: "INTERVIEWING" },
      { status: "REJECTED" },
      { status: "REJECTED" },
      { status: "OFFER" },
      { status: "SUBMITTED" }, // unsettled, excluded from the rate
    ];
    const line = buildOutcomeObservation(apps, "2026-06-10");
    expect(line).toContain("2 of 4");
    expect(line).toContain("(confidence: low, confirmed: 2026-06-10)");
  });
});
```

- [ ] **Step 2: Implement `src/server/engine/outcomes.ts`**

```ts
import { prisma } from "@/server/db";
import { memoryService } from "@/server/memory/service";
import matter from "gray-matter";

const POSITIVE = new Set(["INTERVIEWING", "OFFER"]);
const SETTLED = new Set(["INTERVIEWING", "OFFER", "REJECTED"]);

/** Pure: derive story signal updates from the outcomes of applications that used it. */
export function deriveStorySignal(
  outcomes: { status: string }[],
): { strength: string | null; failure: string | null } {
  const positives = outcomes.filter((o) => POSITIVE.has(o.status)).length;
  const rejections = outcomes.filter((o) => o.status === "REJECTED").length;
  if (positives > 0) return { strength: "high", failure: null };
  if (rejections >= 2) {
    return { strength: null, failure: `used in ${rejections} rejected applications (observational, small sample)` };
  }
  return { strength: null, failure: null };
}

/** Pure: one observation fact line for strategy.md, or null below the sample floor. */
export function buildOutcomeObservation(
  apps: { status: string }[],
  today: string,
): string | null {
  const settled = apps.filter((a) => SETTLED.has(a.status));
  if (settled.length < 4) return null;
  const progressed = settled.filter((a) => POSITIVE.has(a.status)).length;
  return `- Application outcomes: ${progressed} of ${settled.length} settled applications progressed to interview or offer (confidence: low, confirmed: ${today})`;
}

/**
 * Distill outcomes into story signals and a strategy.md observation.
 * Cheap and deterministic (no LLM). Never throws.
 */
export async function distillOutcomes(userId: string): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // 1. strategy.md observation (supersede the previous one by label).
    const apps = await prisma.application.findMany({
      where: { userId },
      select: { status: true },
    });
    const line = buildOutcomeObservation(apps, today);
    if (line) {
      const strategy = await memoryService.read(userId, "strategy.md");
      if (strategy) {
        const re = /^- Application outcomes: .*$/m;
        const next = re.test(strategy.content)
          ? strategy.content.replace(re, line)
          : `${strategy.content.trimEnd()}\n\n## Observations\n${line}\n`.replace(/(## Observations\n)+/, "## Observations\n");
        if (next !== strategy.content) {
          await memoryService.write(userId, "strategy.md", next, "CYCLOPS", "outcome observation");
        }
      }
    }

    // 2. Story signals: map stories -> outcomes via employers_used + applications.
    const files = await memoryService.list(userId);
    const storyFiles = files.filter((f) => f.path.startsWith("stories/"));
    if (!storyFiles.length) return;

    const allApps = await prisma.application.findMany({
      where: { userId },
      select: { employerName: true, status: true },
    });
    const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    for (const file of storyFiles) {
      try {
        const parsed = matter(file.content);
        const used = Array.isArray(parsed.data.employers_used)
          ? (parsed.data.employers_used as { employer?: string }[])
          : [];
        if (!used.length) continue;
        const usedSlugs = new Set(used.map((u) => slugify(String(u.employer ?? ""))));
        const outcomes = allApps.filter((a) => a.employerName && usedSlugs.has(slugify(a.employerName)));
        const { strength, failure } = deriveStorySignal(outcomes);
        const data = { ...parsed.data };
        let changed = false;
        if (strength && data.strength_signal !== strength) {
          data.strength_signal = strength;
          changed = true;
        }
        if (failure && data.failure_signal !== failure) {
          data.failure_signal = failure;
          changed = true;
        }
        if (changed) {
          const next = matter.stringify(parsed.content, data);
          await memoryService.write(userId, file.path, next, "CYCLOPS", "outcome-informed story signal");
        }
      } catch {
        // one bad story file never aborts the rest
      }
    }
  } catch (err) {
    console.error("[outcomes] distillation failed", { userId, err });
  }
}
```

- [ ] **Step 3: Triggers.** In `update_application_status` (tools.ts) after the update succeeds: `void distillOutcomes(userId).catch(() => {})` (tools execute server-side inside the stream; a detached promise is acceptable here, or use the route-level `after` if reachable — keep it simple and detached, errors are swallowed inside). In `src/server/actions/applications.ts` status-update action: `after(() => distillOutcomes(userId))` at action scope.

- [ ] **Step 4:** Tests pass, typecheck, commit `feat(cyclops): outcome distillation into story signals + strategy observations`

---

### Task 4: Chat deep links + tracker affordance

**Files:**
- Modify: `src/app/(app)/chat/page.tsx`, `src/app/(app)/chat/cyclops-chat.tsx`
- Modify: `src/components/tracker/opportunity-table.tsx`

- [ ] **Step 1: `/chat?prefill=<text>` and `/chat?opportunity=<id>`.** In `page.tsx`: coerce both params (string[] guard). If `opportunity` present: load it (public catalog, include employer), build `prefill = "Let's talk about <Employer> - <Title>."`; explicit `prefill` param (≤200 chars, strip control chars) wins. Pass `prefill` prop into `<CyclopsChat>`; when arriving with a prefill, create a NEW thread (redirect to `?t=<new>&prefill=...` if no `t`) so context lands somewhere fresh. In `cyclops-chat.tsx`: initialize the input state with `prefill ?? ""` — never auto-send (user presses Enter; no surprise token spend).

- [ ] **Step 2: Tracker affordance.** In `opportunity-table.tsx`, add a per-row "Ask Cyclops" link (`/chat?opportunity=<id>`) styled per the row's existing action affordances (typographic glyph `?` or `›`, no icons; check how the save button renders and match it). Keep the row click-through to the detail page working (stopPropagation on the link if rows are clickable).

- [ ] **Step 3:** Typecheck, tests, `npm run build`, manual sanity note; commit `feat(cyclops): chat deep links + tracker Ask Cyclops affordance`

---

### Task 5: Extension panel v2

**Files:**
- Modify: `extension/src/content/panel.ts`, `extension/src/content/index.ts`, `extension/src/shared/types.ts` (+ `extension/src/content/messaging.ts` / `extension/src/background.ts` only if payload types require)

UX contract (spec §3.4) — keep the panel's existing Shadow-DOM structure/styling conventions; all additions degrade gracefully when fields are absent (old API):

- [ ] **Step 1: Suggestions on asks.** Plan response ask items may now carry `suggestion: { value, source, confidence }`. Render the ask as a plain question with the suggested value PREFILLED in its input plus a one-tap "Use" affordance showing provenance: `from your memory · HIGH` / `from your answer bank · MEDIUM` (uppercase confidence chip, matching §5.6 language). Accepting writes the value to the field exactly like a typed answer (existing `onAnswerAsk` flow — which already persists the fact). Low-confidence suggestions render as a hint, never auto-filled.

- [ ] **Step 2: Draft provenance + story choice.** The answer response now includes `provenance`. Under each generated draft, render a provenance line: `based on: <storiesUsed joined> · <questionKind>` plus, when `provenance.thinGrounding`, a subtle warning `thin grounding - double-check specifics`. Add a "Different story" button (visible only when `storiesUsed.length > 0`): re-calls generate with `excludeStories: [...allPreviouslyUsedSlugsForThisField]` (track per-field history) and replaces the draft.

- [ ] **Step 3: Pre-staged drafts.** On engage, after `applyPlan` produces drafts: auto-generate ALL draft fields immediately (sequentially, max 3 — more fields than 3 stay manual with the existing Generate button) instead of waiting for clicks. Show per-field "drafting…" state. Abort cleanly if the panel is closed (AbortController or a closed flag checked between calls).

- [ ] **Step 4: Discuss link.** Panel footer gains "Discuss in Cyclops ↗" linking to `<apiBase>/chat?prefill=<encodeURIComponent("Let's talk about my <employer> <role> application.")>` (apiBase from the connection status the content script already receives; target _blank).

- [ ] **Step 5:** `cd extension; npx tsc --noEmit; npm run build` clean; commit `feat(cyclops/ext): panel v2 - suggestions, provenance, story choice, prestage, chat link`

---

### Task 6: Phase-3 verification sweep

- [ ] **Step 1:** `npx tsc --noEmit; npm run test; npm run build` (web) + `cd extension; npm run build` — all clean.
- [ ] **Step 2:** Update `STATUS.md` (phase 3 shipped) and `docs/MANUAL-TASKS.md`: Gate B gains "reload the unpacked extension, then smoke the panel v2 flow on a Greenhouse test page (suggestions on asks, prestaged drafts, provenance line, Different story button, Discuss link)".
- [ ] **Step 3:** Commit `docs: phase 3 verification + status`.

## Out of scope (phase 4)

Agent page-driving fallback (read_page/fill_field/click loop), overnight prep queue + morning brief, gardener cron — phase 4, separate mini-spec first.
