# GB+ Plan 4 of 4 — Applications, Memory, Settings, Activity, Palette, Polish (Spec Phases G+H)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Applications pipeline + per-application workspace with draft review; Memory surfaces gardener questions; Settings leads with permissions-as-sentences; activity log behind the nav pill; ⌘K palette; GB+ idiom sweep over the radar-era components. Completes the spec.

**Tech/conventions:** as Plans 1–3 (vi.hoisted tests in src/test/, {ok/error} actions, GB+ tokens, 11px floor, amber=agent, selection=ink, real buttons, prisma --no-engine fallback). Branch gbplus-ui. **No DB changes.**

**Reuse inventory:** DraftReviewCard (src/components/draft-review-card.tsx — props draftId/question/content/meta, Accept→saveAnswerToBank+resolve, Skip→resolve; attention resolve no-ops when no item exists), updateApplicationStatus + deleteApplication + startApplication (src/server/actions/applications.ts), applications-list.tsx (status dropdown UX to preserve), GardenerQuestion model (status pending|asked|resolved), getOpenAttentionByTarget/getBadgeCounts, formatShortcut/matchesShortcut, dockSuggestions pattern, Monogram component, toUIMessages.

---

### Task 1: Applications pipeline + workspace

**Files:** Rewrite `src/app/(app)/applications/page.tsx`; Create `src/app/(app)/applications/[id]/page.tsx`; Modify `src/components/applications/applications-list.tsx` (or replace with grouped variant — keep the status `<select>` + delete mechanics verbatim).

- [ ] **1.1 Pipeline page:** load applications + draft counts (`prisma.generatedDraft.groupBy({ by: ["applicationId"], where: { userId, applicationId: { not: null } }, _count: true })`). Group rows: **In progress** (DRAFT, AUTOFILLED) / **Submitted** (SUBMITTED, INTERVIEWING, OFFER) / **Closed** (REJECTED, WITHDRAWN), each a GB+ card with `ghead`-style slab caption + count. Row: Monogram-style initial chip, employerName bold + roleTitle muted (linking `/applications/<id>`), `◆ n drafts` agent chip when count>0, ats label, status select (existing mechanics), added date mono, delete ghost. Keep empty state. Submitted group rows add label line "CYCLOPS WATCHES FOR REPLIES" (static truthful copy only if that's accurate — it is NOT yet: omit; instead show submittedAt date when present).
- [ ] **1.2 Workspace page** `/applications/[id]` (async params; auth; `application.findFirst({ id, userId })` + its drafts (`generatedDraft.findMany({ applicationId: id, userId }, orderBy createdAt desc)`) + linked opportunity (when opportunityId) with employer). 404 via notFound() when absent. Layout: `← Applications` link; header: monogram, slab title `${employerName} — ${roleTitle}`, label meta (ats · source · added date · external link ↗); **status pill-strip stepper**: the 7 statuses rendered as a segmented rounded-pill strip — current = bg-ink text-canvas; each other status is a form button posting updateApplicationStatus (confirmation NOT needed — it's reversible); REJECTED/WITHDRAWN visually subdued (text-faint). Below, two sections: **Drafts & answers** card — every draft rendered via `DraftReviewCard` (question from draft.context, meta = kind + model), newest first, empty state "No drafts yet — generate from the extension or ask Cyclops."; **Listing** card when opportunity linked: employer/title/deadline/days + "View listing →" `/tracker/<oppId>` + "Ask Cyclops" link `/chat?opportunity=<oppId>`.
- [ ] **1.3** Pipeline rows link to the workspace; tracker peek's "Continue application" already routes /applications — leave. Gates (tsc/test/build) + commit `feat(gbplus): applications pipeline groups + per-application workspace with draft review`.

### Task 2: Memory — gardener questions surface

**Files:** Modify `src/app/(app)/memory/page.tsx`; Create action in `src/server/actions/attention.ts` (extend): `resolveGardenerQuestion`.

- [ ] **2.1** Action (TDD, extend src/test/attention-actions.test.ts): `resolveGardenerQuestion(id)` — auth; `gardenerQuestion.updateMany({ where: { id, userId }, data: { status: "resolved" } })`; count 0 → error; also `resolveAttentionByKey(userId, \`gq:${id}\`)`; revalidatePath("/memory") + "/today". Void form wrapper.
- [ ] **2.2** Memory page: above the editor pane (full-width, before the rail/editor grid), when pending questions exist render a GB+ card "Cyclops wants to know" (`◆` chip): each pending GardenerQuestion (`findMany { userId, status: "pending" } take 5`) as a row — question text, actions: Link pill "Answer in chat" `/chat?prefill=<question>` + ghost "Dismiss" (resolveGardenerQuestion form). Gates + commit `feat(gbplus): memory surfaces gardener questions with answer/dismiss`.

### Task 3: Settings — permissions as sentences

**Files:** Modify `src/app/(app)/settings/page.tsx`.

- [ ] **3.1** Add a FIRST section card "Cyclops permissions — what the agent may do", rows (label title + mono meta sentence + right chip), ALL static truthful product facts (verify each claim against the code before writing it — adjust copy to reality):
  - "Draft answers in your voice" / "USES ANSWER BANK + CV · ALWAYS ASKS BEFORE SAVING" / chip ON (green-tint `✓ ON`)
  - "Overnight listing refresh & morning brief" / "NIGHTLY CRON · BUDGET-CAPPED" / `✓ ON`
  - "Fill forms via the extension" / "ONLY WITH YOU WATCHING · CONFIRMATION-GATED · NEVER SUBMITS" / `✓ ON`
  - "Submit applications" / "NEVER AUTOMATIC — THIS CANNOT BE ENABLED" / ink statement chip `ALWAYS YOU` (bg-ink text-canvas — bedrock fact, not danger)
  Existing sections keep their forms; wrap each section header in the GB+ slab style if not already. Gates + commit `feat(gbplus): settings lead with Cyclops permissions as sentences; submit is always-you`.

### Task 4: Activity log + ⌘K palette

**Files:** Create `src/app/(app)/activity/page.tsx`; Modify `src/components/app-nav.tsx`; Create `src/components/command-palette.tsx`, `src/server/actions/palette.ts`.

- [ ] **4.1 Activity page** (server): merge recent agent events into one reverse-chron list (take 25 total): brief ChatSessions (title startsWith "Morning brief", updatedAt, → /chat?t=), GardenerRun rows (ranAt, "Memory gardener ran"), EmployerResearch (refreshedAt desc take 10, "Researched <employer>" via include employer), AttentionItems createdAt desc take 10 (kind glyph + title + status). Each row: glyph, text, mono timestamp (en-GB date+time), link when applicable. GB+ card list, h1 slab "Activity". Empty state. AppNav: make the activity pill a `<Link href="/activity">` (keep markup/classes; add hover state + aria-label "Agent activity log").
- [ ] **4.2 Palette:** server action `paletteSearch(q: string)` → `{ listings: {id,label}[] (opportunity title/employer contains q, take 5, include employer), threads: {id,label}[] (chatSession title contains q, NOT dock title, take 5) }` (auth-guarded; q trimmed, <2 chars → empty arrays). TDD (src/test/palette.test.ts: auth fail, short q, shapes). Client `command-palette.tsx`: opened via mod+K (matchesShortcut listener in component, mounted from AppNav replacing the stub button's behavior — button onClick opens too); overlay `role="dialog" aria-modal` z-50, input autofocus, static NAV section (Today/Tracker/Applications/Ask Cyclops/Memory/Radar/Settings/Activity → router.push), debounced (250ms) paletteSearch results sections LISTINGS (→ /tracker/<id>) and CONVERSATIONS (→ /chat?t=<id>); ArrowUp/Down + Enter keyboard selection with `aria-activedescendant` listbox semantics; Esc closes (stack: it's level 1 — call e.preventDefault() so the dock doesn't also act — mirror the defaultPrevented handshake). GB+ styling (rounded-card surface, label captions). Gates + commit `feat(gbplus): activity log page + command palette (mod+K) with listing/thread search`.

### Task 5: GB+ idiom sweep (radar-era debt + contract polish)

**Files:** `src/components/tracker/fresh-finds.tsx`, `src/components/tracker/scout-card.tsx`, `src/app/(app)/radar/page.tsx`, `src/app/(app)/chat/page.tsx` (rail), `src/components/draft-review-card.tsx` + Today ghosts.

- [ ] **5.1** fresh-finds/scout-card/radar: raise every sub-11px size to `text-[0.6875rem]`/`.label`; replace `rounded-[var(--radius-card)]` with `rounded-card`; `border-border-strong bg-surface-2` header bars → `bg-surface-2` with `border-hairline`; remove any font-weight ≥500 on mono; amber audit (agent-meaning only — scout/fresh markers are agent discoveries: ◆-adjacent amber allowed; NEW stays green).
- [ ] **5.2** Rail: active needs-you row keeps a small ◆ indicator while selected (append the `◆` glyph chip to the row content when needsYou, independent of selection — satisfies §2 "selected agent-flagged row shows ink inset + ◆ badge").
- [ ] **5.3** Ghost buttons ("later"/"Skip"/"Dismiss"/"view original"): ensure `min-h-6` (24px hit area). Gates + commit `fix(gbplus): idiom sweep — radar-era components on GB+ tokens, ◆ persists on selection, ghost hit areas`.

### Task 6: Final gate
- [ ] Full tsc/tests/clean build; whole-plan review agent over Plan 4 range; fix round; verdict READY.

## Self-review
1. G+H coverage: pipeline groups ✓ workspace+stepper+drafts ✓ (T1) · memory questions ✓ (T2) · settings sentences + ALWAYS YOU ✓ (T3) · activity log ✓ + §8 palette ✓ (T4) · Phase-H a11y/idiom debt ✓ (T5; full WCAG audit beyond this remains future work — documented). Deferred consciously: proposal stale-state, inbox-reply watching copy (not built — copy omitted), dock-on-settings overlay.
2. No placeholders; every UI block references concrete components/data.
3. Names: resolveGardenerQuestion, paletteSearch, DraftReviewCard reuse consistent.
