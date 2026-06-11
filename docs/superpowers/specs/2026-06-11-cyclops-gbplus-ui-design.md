# Cyclops GB+ UI Revamp — Design Spec

**Date:** 2026-06-11
**Status:** Awaiting user approval
**Decision trail:** 8 visual systems explored → finalists Granola Slab + Swiss Console → 6 UX architectures → GB+ (Granola Sidekick, dense) chosen → full system designed → audited by 4 independent design reviews (visual, interaction, IA, accessibility). This spec is the reconciled output.
**Mockups:** `.superpowers/brainstorm/290-1781180273/content/gbplus-full-system.html` (canonical layout), `224-1781111429/content/density-study.html` (canonical tracker table). Mockups predate the audit token fixes below; where they conflict, this spec wins.

---

## 1. Product intent

Cyclops becomes an ambient-copilot application OS in the spirit of Granola/Devin seamlessness with Bloomberg-terminal DNA: warm paper surfaces, monospace data, typographic glyphs (no icons), extreme readability. The agent works overnight; the user reviews. The UI's job is to make the agent's work **visible, reviewable, and revocable** — never magical, never silent.

## 2. The contract (system-wide laws)

1. **Amber means agent.** Amber appears only adjacent to a ◆ glyph or inside dock/proposal components. Links, sort indicators, selection states are never amber.
2. **Selection is ink.** Selected rows/files/threads use ink inset (`inset 3px 0 0 var(--ink)`) + neutral hover tint. Agent-flagged rows use amber inset + `--hot` tint. A selected agent-flagged row shows ink inset + ◆ badge.
3. **One proposal card.** Identical component on every surface (workspace, dock, chat, memory). One verb set: **Apply / Edit first / Skip** (memory uses the same; "reject" is gone).
4. **⏎ never mutates data.** Apply is always ⌘⏎/Ctrl+⏎ (deliberate commit). ⏎ opens/expands only.
5. **Every apply is undoable.** Applied proposals collapse to a receipt with persistent Undo (version-restore, valid until next manual edit).
6. **The agent never modals, never auto-applies, never edits memory silently.** Submit is permanently human — displayed in Settings as product fact, styled as bedrock (ink chip), not danger.
7. **Green is for events** (submitted, approved, ✓), never default states. `OPEN` status renders neutral.
8. **The dock's context line always tells the truth** about what the agent can see.

## 3. Design tokens (production palette — supersedes mockup values)

All a11y-corrected values come from measured WCAG ratios (audit 4). Implement as CSS variables in `globals.css` (Tailwind 4 `@theme`).

### 3.1 Color

```
Surfaces   --bg #f4f1ea · --card #fffdf9 · --card-head #faf6ee (also hover)
           --thead #f0ebdf · --hot #fdf6ea (agent-warmed tint, only amber tint for rows)
Borders    --border #e3dccd (decorative hairlines) · --hairline #efe9dc (row dividers)
           --border-interactive #847b6e (inputs, secondary buttons — 3:1 boundary)
           --border-agent #ecd9bd (dock + proposal cards only)
Text       --ink #2b2722 · --muted #5d564b · --subtle #6b6256 · --faint-text #756c5f
           --deco #a39885 (NON-TEXT only) · --disabled #b9b0a0 (non-text)
Agent      --agent-text #9a4c0c (all amber text) · --agent-mark #c05f10 (fills, bars,
           rules, dots, focus ring — non-text) · --agent-tint #f8ead9
           --agent-on-dark #f0b35f (badge text inside dark pills)
Semantic   --good-text #3a6246 · --good-mark #4e7d5b · --good-tint #e8efe6
           --warn-text #a93226 · --warn-tint #f6e3e0
           --diff-del #a93226 on #f9ecea · --diff-add #2e6b46 on #ebf2ec
Data       --fit-low #b9b0a0 (bar only) · --fit-mid #8f6b22 · --fit-high #4e7d5b
           (fit bars 6px tall; number always rendered beside bar, colored
            --agent-text/--good-text/ink — never below 4.5:1)
On dark    --on-dark #f4f1ea
```

### 3.2 Type (floor: 11px — nothing renders smaller, ever)

| Token | Font | Size | Weight | Notes |
|---|---|---|---|---|
| display-xl | Zilla Slab | 28px | 600 | Today greeting |
| display-lg | Zilla Slab | 22px | 600 | Page/workspace titles |
| display-md | Zilla Slab | 16px | 600 | Card heads, doc headings, thread titles, logo |
| ui-lg | Karla | 14px | 400 | Prose: brief, chat both sides, dock narration |
| ui-md | Karla | 13px | 400/800 | Default UI; row titles + buttons at 800, pills 700 |
| mono-data | Fragment Mono | 12px | 400 | Table numbers, diff text, input prompts |
| mono-label | Fragment Mono | 11px | 400 | Metadata, chips/tags, timestamps, column heads, status, kbd hints; uppercase variant tracks ≤0.08em |

Rules: **Fragment Mono is never bold** (the family has no 600 — mockups were synthesizing); emphasis in mono = color tier or size. No half-pixel sizes. Implement in rem (root 16). Karla ships 400/700/800; Zilla Slab 500/600. Loaded fonts: exactly these three families.

### 3.3 Space / radius / shadow

- Spacing: 2 · 4 · 8 · 12 · 16 · 20 · 24 · 32. Page gutter 20; card gap 16; card padding 16; tracker cell pad-x 16.
- Radius: 6 (micro glyphs, diff lines) · 10 (nested cards, inputs, `.ic`) · 14 (cards, dock, composer) · 999 (pills).
- Shadows: `--shadow-card: 0 2px 6px rgba(70,60,40,.05), 0 12px 32px -20px rgba(70,60,40,.14)`; `--shadow-float` for composer/popovers. Dock: border only, no shadow.
- Letter-spacing: .06em (mono-label) / .08em (uppercase micro variant). Line-height: 1.2 display / 1.5 UI / 1.7 prose & diffs.

## 4. Information architecture

### 4.1 Site map

| Route | Shows | Nav badge |
|---|---|---|
| `/today` | Greeting · morning brief card · Needs-you queue · Coming up | All open attention items |
| `/tracker` | Dense board (52 listings); `?filter=closing|strong|starred`, `?density` | — |
| `/tracker/[id]` | **Listing peek** (slide-over; routable for deep links) | — |
| `/applications` | Pipeline: In progress / Submitted / Closed | Items targeting applications |
| `/applications/[id]` | Application workspace; dock auto-pins | — |
| `/chat`, `/chat/[threadId]` | **Ask Cyclops** — the standalone chat destination for open-ended conversation, independent of any page context: thread rail (Needs you / Today / This week / Archived) + reader | Threads with ≥1 open item |
| `/memory`, `/memory/[file]` | File rail · document · pending proposals | Items targeting memory |
| `/settings` | Permissions-as-sentences · profile · extension · answer-bank link | — (via avatar menu + ⌘K) |

Primary nav (every page): **Today · Tracker · Applications · Ask Cyclops · Memory** + ⌘K search + agent activity pill + avatar (menu: Settings, Sign out). "Ask Cyclops" is the chat pill — always one click away at the top, for users who just want to talk to the agent without any page context; a new thread started there carries no pin by default. Redirects: `/dashboard→/tracker`, `/saved→/tracker?filter=starred`, `/opportunities/[id]→/tracker/[id]`. Auth + onboarding stay outside the shell; onboarding seeds Memory and lands on `/today` (with designed "no brief yet — I work overnight" state).

### 4.2 Listing lifecycle

Tracked (Tracker) → Starred (★ filter; bookmark only) → **"Start application"** (explicit promotion — user click or user-approved agent proposal, never implicit) → Drafting → Submit (human-only) → Submitted (agent watches) → Closed (outcome notes proposed into Memory). Tracker status column shows posting status only (OPEN/CLOSED, neutral); pipeline state appears as a tag in the firm cell ("✓ submitted", "◆ drafting").

### 4.3 The attention system (single source of truth)

One store: **AttentionItem** (kind: proposal | flag | question | brief; target: answer/listing/memory-file/thread; state: open | snoozed | resolved). Every badge is a filtered count of this store (per table above; collapsed-dock badge = Today's count). Resolving anywhere decrements all views atomically. Dock suggestions are ephemeral derived prompts — regenerated per page, never persisted, never dismissible (not a fourth store). Today's "later" = snooze-to-tomorrow with ×n escalation; "skip" on a draft-offer dismisses the offer only — the underlying gap stays visible in the workspace.

## 5. The dock

286px right rail on every shell page except Settings. Contains: header (◆ cyclops + truthful context line), narration (max ~3 sentences), ≤3 suggestion chips (clicking sends as a message), input, collapse hint.

**States & transitions** (⌘J = expand toggle; ⌘⇧J on mac / **Ctrl+\\** on win = collapse toggle — Ctrl+Shift+J is browser-reserved and never bound):
- collapsed (edge tab + badge) ⇄ docked ⇄ expanded (overlay with thread rail; URL unchanged)
- ⌘J: collapsed→expanded, docked→expanded, expanded→previous state. Esc: expanded→docked only (via esc stack).
- Dock state + active thread persist in localStorage, never the URL. `/chat/[threadId]` is the only routable conversation. Below ~1100px viewport the dock auto-collapses; expanded goes full-screen.

**Thread identity — contextual by default, sticky when engaged:** each page context has its own thread and the dock follows navigation; the moment the user has unsent draft text or sent a message within the last 5 minutes, the dock locks to that thread across navigation (with "↩ back to this page's thread"). Drafts preserved per-thread, always. ⌘J on Settings opens the expanded overlay with context line "SEES: NOTHING — you're in Settings."

## 6. Proposal cards (global state machine)

One entity, global state, all renderings synced live: **pending → applied | skipped | stale | superseded**.
- **Applied** → one-line receipt "✓ Applied · 09:41 · Undo" (persistent until next manual edit). Chat thread logs outcome ("3 edits applied ✓").
- **Skipped** → "Skipped — won't re-propose" + reconsider link.
- **Edit first** → card expands in place into an inline editor pre-filled with proposed text ("view original" toggle); Save = apply-with-edits (recorded as user-modified for agent learning); in the 286px dock the card auto-expands the dock first. No modal anywhere.
- **Stale** (target text changed since drafting) → actions disabled, "Your answer changed — Re-check" triggers re-draft.
- Keyboard when card focused: **⌘⏎ Apply · E Edit · S Skip · ⏎ expand diff**. Cards are items in the page's J/K order with amber focus ring.
- A11y: `role=group`, diff uses `<del>/<ins>` + sr-only "removed:/added:", real buttons.

## 7. Pages (deltas from mockup after audit)

- **Today:** brief card is `h2`; "Review/Confirm/Draft it" + "later" per queue item; queue items show partial progress ("1 of 2 reviewed"); designed states: queue-clear, no-overnight-work brief ("Quiet night — next sweep 19:00"), partial-failure brief ("refreshed 11 of 14 — 3 sites blocked me"), pre-07:00 preparing.
- **Tracker:** 34px compact / 44px comfy rows (comfy = touch default); row actions always in DOM, revealed on hover AND focus-within, ⋯ overflow on coarse pointers; closed rows recolor text (no container opacity); real `<table>` semantics with `aria-sort`; ⏎ opens **listing peek** (or workspace if application exists); footer kbd hints at mono-label 11px.
- **Listing peek (new):** slide-over: facts, fit breakdown, deadline history, agent notes; actions: Start application / Ask Cyclops. Esc closes (stack level 1).
- **Applications:** completion meters are **ink** fill (progress ≠ fit ≠ agent); "— not started" is a neutral chip; submitted rows state what the agent watches.
- **Workspace:** `← Applications` back link; Answers card lists **all** questions + upload rows, each in exactly one state: approved / draft ready / draft queued ("show now" link) / drafting… / not started / in-edit / stale; stepper is status-only (completed stages clickable to summaries; SUBMIT never tappable into submission).
- **Chat page:** in primary nav permanently, badge included; rail groups Needs you / Today / This week / Archived (collapsed, read-only until unarchive); resolution marks; ⌘F = thread search inside chat surfaces only (browser-native elsewhere); "+ New" inherits current page pin as removable chip.
- **Memory:** same proposal card + verbs as everywhere; answer bank lives here (Settings links in); pending-edit gives Memory pill its badge.
- **Settings:** permissions as sentences; "Submit applications — ALWAYS YOU" rendered as ink statement chip (not red, not a control); avatar menu is its entry point.
- **Activity log (new):** slide-over opened by the agent activity pill (pill shows exactly: working-live / last-completed / idle / error); also where "worked" chip details land. The worked chip gets a running state ("working — 3 steps…").

## 8. Keyboard map (platform-aware; hints rendered from a shortcut service, never hardcoded)

| mac / win | Scope | Action |
|---|---|---|
| ⌘K / Ctrl+K | global | Command palette (firms, applications, threads, memory files, nav verbs, Settings) |
| ⌘J / Ctrl+J | global | Dock expand toggle |
| ⌘⇧J / Ctrl+\\ | global | Dock collapse toggle |
| Esc | global stack | 1 close palette/peek · 2 cancel inline edit (confirm if dirty) · 3 blur input (draft kept) · 4 expanded→docked |
| ? | non-input | Shortcut overlay |
| J/K ↓/↑, ⏎ | lists | Move focus; open (never mutates) |
| S, A | focused tracker row | Star · Ask Cyclops (dock prefilled+pinned) |
| ⌘⏎, E, S | focused proposal | Apply · Edit first · Skip |
| ⏎ / ⇧⏎ | composer | Send / newline |
| ⌘Z | post-apply window | Undo |

Rule zero: focus in an editable field → only modifier chords + esc stack fire.

## 9. Accessibility requirements (build acceptance criteria)

- All text ≥11px and ≥4.5:1 on its actual background (token table §3.1 achieves this; no exceptions).
- `:focus-visible`: 2px `--agent-mark` outline, offset 2 (inset −2 in table rows); `--on-dark` outline on dark surfaces. Never border-color-only focus.
- Interactive elements are real `<button>/<a>` (mockups' spans/divs do not carry over); min 24×24px hit areas; 44px rows on coarse pointers.
- Glyphs wrapped `aria-hidden` + sr-only text ("Cyclops proposal", "deadline moved"); urgency never color-only (▲/T−n chip accompanies red days).
- Streaming: chat `role=log aria-live=polite`, append by sentence not token; dock narration `role=status`; no auto-scroll under prefers-reduced-motion (pin "jump to latest"); PRM kills the pulse animation and transitions.
- Real labels on composers (visually hidden ok); placeholders at `--faint-text`.
- Landmarks: nav `aria-label=Primary` + `aria-current`; badges as readable labels ("Today, 3 items need attention"); dock = `aside role=complementary`.
- Test gates: 200% zoom, 320px reflow (dock collapses, never overlaps).

## 10. Migration plan (phases — each independently shippable)

DB changes ship as additive SQL in `prisma/sql/` for the user to run (project rule).

- **Phase A — Token foundation.** Rewrite `globals.css` `@theme`: new palette (§3.1), type scale (§3.2), fonts (Zilla Slab/Karla/Fragment Mono replace Libre Franklin/JetBrains Mono/Newsreader), radius/shadow tokens. Map old token names to new values where possible so existing pages degrade gracefully. Visual-only; no route changes.
- **Phase B — Shell.** New top nav (pills, ⌘K stub, activity pill, avatar menu) replaces dark chrome header + status bar. Route renames + redirects (`/dashboard→/tracker`, `/saved→★ filter`, `/opportunities/[id]→/tracker/[id]`). Esc-stack + shortcut service utilities.
- **Phase C — Attention store.** `attention_items` table (additive SQL); badge counts as filtered views; wire existing proposal/flag/brief events into it. This is the keystone — Today, badges, and proposal sync all hang off it.
- **Phase D — Tracker.** Dense board (34/44px densities), listing peek, row tags, keyboard nav, real table semantics. Port existing filters.
- **Phase E — Dock + chat.** Dock component (3 states, thread identity rules, localStorage persistence), unified proposal card with global state machine + undo, chat page regrouped rail. Existing `/chat` data model carries over (threads gain pin + attention metadata).
- **Phase F — Today.** New landing: brief (canonical = ◆ AUTO thread, card renders summary), Needs-you queue (views over attention store), Coming up. All four brief states designed.
- **Phase G — Applications + workspace.** Pipeline page, workspace with full answer roster states, stage stepper, ink completion meters.
- **Phase H — Memory, Settings, Activity log, a11y pass.** Memory proposals UI + answer bank consolidation; Settings rewrite; activity log slide-over; full keyboard/screen-reader/PRM/zoom acceptance pass (§9).

Sequencing rationale: A+B are cheap and make everything after feel native; C unblocks D–F's shared machinery; the dock (E) lands before Today (F) so Today's queue actions have somewhere to resolve.

## 11. Out of scope

Mobile-native layouts (desktop-first, extension-coupled; dock auto-collapse + comfy density is the v1 touch story), dark mode (Espresso variant noted as future night-mode on same tokens), landing/auth redesign, onboarding content changes (it only gains the new shell + Memory-seeding framing).
