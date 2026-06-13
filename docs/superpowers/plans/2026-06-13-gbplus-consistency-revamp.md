# GB+ Consistency Revamp — Implementation Plan

**Date:** 2026-06-13 · **Branch:** `gbplus-revamp` (base: `main` @ fc105a4)
**Design source of truth:** `design/gbplus-redesign.html` (screenshot-verified against the live app's real Tailwind `@theme`).
**Spec:** `docs/superpowers/specs/2026-06-11-cyclops-gbplus-ui-design.md`.

## Goal
Bring Ask Cyclops, the dock, Tracker, Memory, Settings, Applications and Workspace onto one consistent GB+ language: **floating rounded cards on linen**, **amber = agent only**, **ink selection**, **one shared proposal card**, **rounded composer everywhere** (no rectangular inputs), Karla chat prose, Fragment-Mono for data only.

## Contract reminders (do not violate)
- Amber (`--agent-mark`/`--accent`) appears only next to ◆ or inside dock/proposal/agent affordances — never user bubbles, selection, or generic buttons.
- Selection = ink inset (`shadow-[inset_3px_0_0_var(--color-ink)]`) + neutral tint. Agent-flagged = amber inset + `--accent-tint` (`#fdf6ea`, the "hot" wash). Selected+flagged = ink inset + ◆ badge.
- ⏎ never mutates; Apply is ⌘⏎. Verb set everywhere: **Apply / Edit first / Skip** (no "reject", no "accept").
- Type floor 11px. Fragment Mono never bold. Radii: 6 / 10 (control) / 14 (card) / 16 (composer) / pill.

## Phases (each independently shippable + tested)

### Phase 1 — Shared `ProposalCard` primitive  ✦ foundation
New `src/components/ui/proposal-card.tsx`: header (◆ chip + provenance), optional `<del>/<ins>` diff (sr-only "removed:/added:"), actions **Apply / Edit first / Skip** (⌘⏎/E/S), `role=group`, amber focus ring, applied→receipt ("✓ Applied · Undo"), skipped→"Skipped — reconsider". Pure presentational shell; callers wire the mutations.
- Refactor `DraftReviewCard` to render on top of it (verbs Accept→Apply; keep accept/skip server actions).
- Tests: `src/test/proposal-card.test.tsx` — renders verbs, fires onApply/onSkip, ⌘⏎ applies, ⏎ does not mutate, diff a11y labels.

### Phase 2 — Ask Cyclops chat (`cyclops-chat.tsx`)  ✦ core complaint
- User bubble → ink fill, cream text, `rounded-[14px_14px_4px_14px]`, Karla 14px (was amber rectangle).
- Agent message → bare Karla prose 14px/1.7, no box.
- Composer → rounded-16 card: `›` prompt, Karla input, ink Send inside; Stop while streaming; keep char counter, keydown, autoscroll.
- Tool chips → GB+ "worked" pill (rounded-pill `bg-surface-3`, green ✓, mono 11px). Memory-diff `<details>` retoken.
- Suggestions → keep rounded-pill, Karla 700.

### Phase 3 — Chat page as cards (`chat/page.tsx`)
Gutter layout; thread rail → card (search + ink "+ New", grouped, ink-inset active, `--hot` for needs-you); thread title bar bare above a feed **card**; composer card. Needs-you tint `accent-tint` not amber wash on the row bg per contract.

### Phase 4 — Dock as floating card (`cyclops-dock.tsx`)
Docked rail: `m-…` gutter, `rounded-card border border-border-agent shadow-card` (was flat `border-l`). Header buttons + footer unchanged. Expanded overlay unchanged. Re-verify Granola "floats over content" still holds (fixed positioning + gutter).

### Phase 5 — Tracker (`tracker/page.tsx`, `filters-bar.tsx`)
- Remove the "Tracker / Summer 2027" title strip and the stats ribbon (counts live in pills + footer).
- `filters-bar.tsx`: square amber controls → **ink rounded pills** (`bg-ink text-canvas` active, `bg-surface-3` rest), mono counts. Keep faceted dropdowns but re-skin to pills/rounded popovers.
- Move `FreshFinds` + `ScoutCard` off the board (relocate to `/radar` or below as a separate "Radar" section — confirm placement; default: own section under board, not inside the board card). Tape + board already on-spec.

### Phase 6 — Memory (`memory/page.tsx`)
- Rail + document + dock → floating cards in a gutter (was flat `border-r`).
- File rows → two-line: Karla bold filename + mono meta (derive meta from real signals: pending-edit badge, last-edited date, or path). Ink-inset selection; ◆ badge for pending-edit files.
- Memory proposal → shared `ProposalCard` (verbs Apply/Edit first/Skip — **kill "reject"** in `memory-editor.tsx`).

### Phase 7 — Settings (`settings/page.tsx`)
Permissions card already on-spec. Collapse the inline `SettingsForm`/`ApplyProfileForm`/`AnswerBankManager`/`ExtensionConnect` into quiet **link rows** that open focused editors (route or disclosure). Keep all edit functionality.

### Phase 8 — Applications + Workspace
- Applications completion meter → **ink** fill with answers count; re-skin group headers to slab.
- Workspace: stepper pill-strip; answers spine; in-flow `ProposalCard`.

### Phase 9 — QA gate
`npm test` (407+ green), `npx tsc --noEmit`, `npm run lint` (0 errors), `next build`. Screenshot each authed page on the dev server (Edge + `design/_shot.js` pattern) and diff against `design/gbplus-redesign.html`. a11y: focus rings, 200% zoom, reduced-motion, keyboard map.

## Sequencing
1 → 2 → 5 → 4 → 6 → 3 → 8 → 7 → 9. (Proposal card first since 2/6/8 reuse it; tracker filters + dock are quick wins; settings last.) Each phase: implement → tsc/test → commit. Hold the PR until Phase 9 passes, or ship per-phase behind the existing GB+ surfaces.
