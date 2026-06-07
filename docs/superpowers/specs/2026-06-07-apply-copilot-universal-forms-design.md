# Apply Copilot — Universal Form Understanding & Ask-or-Deduce

**Date:** 2026-06-07
**Status:** Approved design, ready for implementation planning
**Scope:** Idea 1 (semantic form-understanding engine) + Idea 2 (ask-or-deduce conversational copilot). Idea 3 (multi-step action agent) is explicitly deferred.

## Goal

Take the apply copilot from "autofills 4 verified ATS hosts via regex" to "understands and helps complete *any* application form on the web" — Google Forms, Lever/Greenhouse/Ashby/Workday, and bespoke bank portals (Jane Street, Citadel). On any page that looks like an application form, the copilot should: silently fill what it knows, draft prose answers for review, and ask the user concise questions for facts it can't ground — learning each answer so it never asks twice.

The copilot **never submits**. The user always reviews and submits.

## Why this shape (research rationale)

The category splits into two philosophies:

- **Assistive copilots** (Simplify, 1M+ users): extension fills standard fields + drafts custom answers; user reviews and submits. Weakness: misfires on customized career sites; drops a draft and walks away.
- **Autonomous auto-apply bots** (LazyApply, Sonara): submit on the user's behalf. Independent reviews report ~85% accuracy with ~15% skipped/wrong on custom *required* fields, no audit log, generic output.

For UK finance — low-volume, ultra-high-stakes applications — autonomous auto-submit is the wrong model. Quality and trust dominate volume.

Agents perceive pages three ways: **vision** (screenshots → coordinates; universal but expensive, trips bot detection, needs a fresh session), **accessibility tree** (cheap, breaks on custom UIs), and **runtime DOM** (token-efficient, handles legacy/complex forms, and — critically — runs inside the user's authenticated session, preserving auth and avoiding bot detection). DOM-driven approaches beat vision by 12–17 points on reliability.

Because we are a **browser extension running in the user's logged-in session**, we are already in the runtime-DOM regime — the right architecture for authenticated personal use. Conclusion: build an **in-page, DOM-first, human-in-the-loop assistive agent**, not an autonomous remote auto-submitter. This is the single insight that de-risks the project.

Sources: [Three browser-agent architectures](https://dev.to/alexey_sokolov_10deecd763/runtime-snapshots-16-the-three-architectures-of-browser-agents-4gkc), [Computer-use agents matrix](https://www.digitalapplied.com/blog/computer-use-agents-2026-claude-openai-gemini-matrix), [Framework benchmarks](https://bytetunnels.com/posts/browser-agent-frameworks-compared-browser-use-vs-stagehand-vs-skyvern/), [Simplify review](https://skywork.ai/skypage/en/Simplify-Extension-In-Depth-Review-(2025)-Your-Ultimate-AI-Job-Search-Copilot/1974365563567271936).

## Key decisions (locked)

1. **Scope:** Ideas 1 + 2. Defer the multi-step action agent (Idea 3).
2. **Activation:** Hybrid — *detect → cue → expand*. A tiny passive detector runs on all sites; when a page looks like an application form it shows an unobtrusive cue. **No data leaves the page until the user clicks to engage.**
3. **Permissions:** `<all_urls>` content script for the detector (broadest reach), with the schema POST gated on user engagement.
4. **Payload:** the content script sends a **compact field schema** (labels, types, options, required-ness) — never raw DOM or the user's typed answers.
5. **Ask vs deduce — split by field type:** high-confidence map → silent fill (✅); unmappable **factual** field → **ask** the user (❓); **essay/free-text** → **draft** for review (✏️).
6. **Never auto-submit.**

## Architecture

Three layers, each with one responsibility:

- **Content script (in-page, per-tab)** — *perceives and acts.* Detects application forms, serializes the compact field schema, applies the returned fill plan to the live form, and runs the triage/ask-or-deduce UI. Stays in the user's authenticated session.
- **Backend** — *the brain.* New `POST /api/ext/plan` takes the field schema + the user's `ApplyProfile`/CV/answer-bank and returns a fill plan. Existing `POST /api/ext/answer` continues to handle essay drafting (answer-bank match → LLM generation). The Anthropic API key never leaves the server (`server-only`).
- **Adapters (slimmed)** — the 4 ATS adapters become *optional hints* (form-container selectors, employer/role extraction). The generic path becomes the default, powered by the LLM plan. `field-map.ts` regex is demoted to a cheap offline pre-pass / fallback.

## Data flow — the fill-plan contract

```
form detected → content script builds FieldSchema[]
  FieldSchema: { id, label, nearbyText, type, options?, required, charLimit? }
        │  (only after the user clicks the cue — hybrid activation)
        ▼
POST /api/ext/plan  { fields, employer, role, url }
        │  LLM maps each field against ApplyProfile + CV + answer-bank
        ▼
FillPlan[] {
  fieldId,
  action: "fill" | "ask" | "draft" | "skip",
  value?,          // present for "fill"
  confidence,      // 0..1
  question?,       // present for "ask" — human-readable prompt
  reason?          // why it couldn't map (shown on hover)
}
        ▼
content script: apply "fill" silently; queue "draft"/"ask" in the panel
```

Mapping of `action` to the type-split decision:
- `fill` — high-confidence map to a known profile value.
- `ask` — factual field the LLM cannot ground (salary, visa specifics, GPA scale, niche dates).
- `draft` — essay/open-ended question; routed to `/api/ext/answer` for generation.
- `skip` — not user-fillable (e.g. captcha, file upload handled separately, decorative).

## Ask-or-deduce loop + learning

- **Triage:** every field lands in **✅ filled · ✏️ draft to review · ❓ needs you**.
- **Ask:** a `❓` renders one concise question. The user's answer is written into the live form **and** persisted: structured facts → `ApplyProfile`; one-off Q&A → `AnswerBankItem`. It is never asked again, on this form or the next.
- **Deduce/draft:** `✏️` reuses the existing answer-bank fuzzy match → LLM generation pipeline (`/api/ext/answer`).
- **Compounding moat:** each completed application enriches the profile/bank, so the next application has fewer `❓`s.

## Panel UX

Reuses the existing Shadow-DOM panel shell and amber/ink styling. Replaces today's single "Autofill" button with the three-bucket triage.

Dormant cue (pre-engage, bottom-right, no network):

```
        ╭───────────────────────────────╮
        │ ◆ Trackr — apply with copilot │
        ╰───────────────────────────────╯
```

Engaged panel:

```
┌─ Trackr · Citadel — Quant Research Intern ──────── × ┐
│  Application form detected                            │
│  ┌─────────────────────────────────────────────────┐ │
│  │  ✅ Filled 11 fields            [review] [undo]  │ │   ← collapsed by default
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ❓ Needs you (2)                                     │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Expected salary (GBP)?                            │ │
│  │ [ 55000                        ] [→ fill & save] │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ Eligible to work in the UK without sponsorship?   │ │
│  │                        ( ) Yes  ( ) No  → save    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ✏️ Drafts to review (1)                              │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Why are you interested in Citadel?   (max 1500)   │ │
│  │ ┌───────────────────────────────────────────────┐ │
│  │ │ Citadel's systematic approach to … (draft)    │ │
│  │ └───────────────────────────────────────────────┘ │
│  │ [redraft] [insert] [save to bank]                 │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  You review and submit. Trackr never submits for you.│
└───────────────────────────────────────────────────────┘
```

## Permissions & privacy

- Manifest broadens from 4 hosts to an `<all_urls>` detector content script.
- The passive detector is tiny and performs **no network calls**. The field-schema POST is gated on the user clicking the cue.
- The payload is a **field schema — labels and option lists — not page content, not the user's typed answers, not unrelated page text.**
- The footer reaffirms: the copilot never submits.

## Codebase changes

| File | Change |
|---|---|
| `extension/manifest.json` | broaden `matches` to `<all_urls>` for the detector; keep ATS-specific scripts as hints |
| `extension/src/content/detect.ts` *(new)* | "is this an application form?" heuristic + dormant cue |
| `extension/src/content/field-map.ts` | demote regex to fallback / cheap pre-pass |
| `extension/src/content/autofill.ts` | apply a `FillPlan` instead of a flat field map |
| `extension/src/content/panel.ts` | three-bucket triage + ask cards |
| `extension/src/content/index.ts` | orchestrate detect → engage → plan → apply |
| `extension/src/shared/types.ts` | `FieldSchema`, `FillPlan` types |
| `src/app/api/ext/plan/route.ts` *(new)* | schema → fill plan endpoint |
| `src/server/ai/generate.ts` | add `planForm()` |
| `src/lib/validation.ts` | request schema for `/api/ext/plan` |
| `src/server/actions/applyProfile.ts` | write-back of asked facts |

## Build order

1. **Brain:** `/api/ext/plan` + `planForm()`. Test against captured form schemas (golden fixtures from the 4 known ATS + a Google Form + one bespoke portal).
2. **Apply pipeline:** content-script schema serialization + plan application. Validate headless on known ATS first (parity with current behavior).
3. **Detector + cue:** `<all_urls>` detection heuristic and the dormant pill.
4. **Triage + ask-or-deduce:** panel three-bucket layout, ask cards, write-back to `ApplyProfile` / `AnswerBankItem`.

## Success criteria

- Copilot detects and offers help on a Google Form and at least one bespoke (non-ATS) application page, in addition to the existing 4 ATS.
- On a known ATS, fill accuracy is at least at parity with the current regex engine (no regressions).
- Factual fields it cannot ground produce a precise `❓` question rather than a wrong guess; essay fields produce a draft.
- An answer given to a `❓` is persisted and not re-asked on a subsequent form with the same field.
- No network request is made by the detector before the user engages.
- The copilot never triggers a form submission.

## Non-goals (this phase)

- Multi-step / multi-page wizard navigation and "Next"-button driving (Idea 3).
- Vision / screenshot fallback for canvas or custom widgets (Idea 3).
- Auto-submitting applications — ever.
- File-upload automation beyond attaching the stored CV where a standard file input exists.

## Risks & mitigations

- **Over-eager detection** (cue appearing on non-application pages) → conservative heuristic (form + minimum field count + apply/role keywords); easy dismiss; per-site mute.
- **LLM mis-maps a field with high confidence** → confidence threshold tuned conservatively; `fill` values are visibly marked and reversible (`undo`); never touches submit.
- **Token cost on large forms** → compact schema + Haiku for mapping; one plan call per form, not per field.
- **Privacy perception of `<all_urls>`** → detector does no network I/O; schema-only payload gated on engagement; documented in the extension store listing.
- **Chrome Web Store review of broad host permissions** → justify in listing; the activeTab-only fallback remains available if review demands it.
