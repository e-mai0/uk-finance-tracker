# GB+ Plan 3 of 4 — Dock + Today + Draft Review + Chat Regroup (Spec Phases E+F)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Cyclops docked on every page (collapsed ⇄ 286px ⇄ expanded overlay, ⌘J/Ctrl+J), the real Today page (brief hero with absence states, Needs-you queue with working actions, Coming up), draft-review cards (Accept→answer bank / Skip), and the Ask Cyclops rail regrouped by attention.

**Architecture:** The dock reuses the existing `CyclopsChat` client (gains `compact` + `suggestions` props) against a per-user persistent "Dock" ChatSession fetched lazily via a server action on first open. Dock state lives in localStorage; the layout mounts the dock as a flex sibling of `<main>`; a client shell hides it on /settings. Today is a server page over the attention store + brief ChatSession + tracker deadlines. Draft review wires GeneratedDraft → AnswerBankItem upsert + attention resolve.

**Tech:** Next 15, existing chat transport (`/api/chat` with sessionId), Prisma, vitest (vi.hoisted convention, src/test/), GB+ tokens, src/lib/shortcuts.ts.

**Branch gbplus-ui. No DB changes in this plan.** Conventions: catch(_e), 11px floor, Fragment Mono never bold, amber = agent only, real buttons/links.

---

### Task 1: Chat reuse layer — compact CyclopsChat, message parsing helper, dock-thread action (TDD where pure)

**Files:** Modify `src/app/(app)/chat/cyclops-chat.tsx`; Create `src/server/chat/messages.ts` (extract), `src/server/actions/dock.ts`, `src/lib/dock-context.ts`; Test `src/test/dock-context.test.ts`, `src/test/dock-actions.test.ts`.

- [ ] **1.1** Extract the ChatMessage→UIMessage[] parsing the chat page does into `src/server/chat/messages.ts` as `export function toUIMessages(rows: { id: string; role: string; parts: string }[]): UIMessage[]` (read chat/page.tsx for the exact current parsing incl. aborted handling; move logic verbatim, re-import in page).
- [ ] **1.2** `src/lib/dock-context.ts` (pure, client-safe):

```ts
/** Truthful dock context line per route (spec: the dock never lies about what it sees). */
export function dockContextLabel(pathname: string): string {
  if (pathname.startsWith("/tracker/")) return "SEES: LISTING";
  if (pathname.startsWith("/tracker")) return "SEES: TRACKER";
  if (pathname.startsWith("/applications")) return "SEES: APPLICATIONS";
  if (pathname.startsWith("/memory")) return "SEES: MEMORY";
  if (pathname.startsWith("/radar")) return "SEES: RADAR";
  if (pathname.startsWith("/today")) return "SEES: TODAY";
  if (pathname.startsWith("/chat")) return "SEES: CHAT";
  return "SEES: APP";
}

/** ≤3 canned conversation starters per surface; clicking sends as a message. */
export function dockSuggestions(pathname: string): string[] {
  if (pathname.startsWith("/tracker"))
    return ["What should I apply to first?", "Which deadlines are closest?", "Why are my top fits ranked that way?"];
  if (pathname.startsWith("/applications"))
    return ["What's left before I can submit?", "Review my latest answers", "Which application is most at risk?"];
  if (pathname.startsWith("/memory"))
    return ["Which of my stories are unused?", "Quiz me on my voice rules", "What did you learn this week?"];
  if (pathname.startsWith("/today"))
    return ["Walk me through the brief", "Plan my week", "What changed overnight?"];
  return ["What needs my attention?", "Summarise where I stand", "What did you do overnight?"];
}
```

Test both functions (route→label table incl. /tracker/abc, /settings fallthrough, suggestions ≤3 everywhere). TDD: failing test → implement → pass.
- [ ] **1.3** `src/server/actions/dock.ts` ("use server"): `getOrCreateDockThread(): Promise<{ sessionId: string; messages: UIMessage[] } | { error: string }>` — auth guard (match actions conventions); find ChatSession `{ userId, title: "Dock" }` newest; create if absent; load last 30 messages ordered createdAt asc; return via `toUIMessages`. TDD with mocked prisma (find/create paths, auth-fail path).
- [ ] **1.4** `cyclops-chat.tsx`: add optional props `compact?: boolean` and `suggestions?: string[]`. compact: tighter paddings (px-3 py-2 feed, smaller composer), hide char counter. suggestions: when `messages.length === 0 && !isStreaming`, render ≤3 chips ABOVE the composer — `<button>` per suggestion, GB+ pill (border border-border rounded-pill px-3 py-1.5 text-[0.8125rem] font-bold text-muted hover:border-agent-mark hover:text-accent), onClick sends it immediately via the same send path as submit (sendMessage with text; check the component's existing submit call and reuse). NO behavior change when props absent. Keep all existing page behavior identical.
- [ ] **1.5** Gates: tsc, `npm test` (new tests green, 359+), build. Commit `feat(gbplus): chat reuse layer — compact mode, suggestions, dock thread action`.

---

### Task 2: The dock

**Files:** Create `src/components/dock/cyclops-dock.tsx`; Modify `src/app/(app)/layout.tsx`.

- [ ] **2.1** `cyclops-dock.tsx` ("use client"). Props: `{ badge: number }`. State machine `"collapsed" | "docked" | "expanded"`, default collapsed, persisted localStorage `dock-state` (read in useEffect to avoid hydration mismatch). Hidden entirely on `/settings` (usePathname). Lazy thread: first time state !== collapsed, call `getOrCreateDockThread()` (useTransition/async in effect), hold `{sessionId, messages}` in state; show a one-line "waking Cyclops…" label while loading; on `{error}` show it with a retry button.

Keyboard (document listener): `matchesShortcut(e, "mod+J")` → expand-toggle (collapsed→expanded, docked→expanded, expanded→its previous state — track `prevRef`); `matchesShortcut(e, "collapse")` → collapse-toggle (docked⇄collapsed, expanded→collapsed); `Escape` when expanded AND target not inside an open menu → docked. Rule zero: when target is editable, only the mod chords fire (esc: if focus is the dock composer, first blur (preventDefault, target.blur()), second esc docks — implement via checking `document.activeElement`).

Render:
- collapsed: fixed right-edge tab (right-2 bottom-24, vertical): `◆` glyph (text-agent-mark), badge count when >0 (rounded-pill bg with --agent-text… use the existing badge idiom: `tabular text-[0.6875rem]` on `bg-accent text-accent-fg` pill), aria-label "Open Cyclops (⌘J)" with `formatShortcut("mod+J")` hint; click → docked.
- docked: `<aside aria-label="Cyclops assistant" className="hidden w-[286px] shrink-0 border-l border-border-agent bg-surface lg:flex lg:flex-col">` with header row (label `◆ CYCLOPS` in text-accent + context line `dockContextLabel(pathname)` label text-faint + buttons: expand `⌘J` and collapse `—`), then `<CyclopsChat compact sessionId=… initialMessages=… suggestions={dockSuggestions(pathname)} />` keyed by sessionId, footer hint row (label text-faint: `{formatShortcut("mod+J")} EXPAND · {formatShortcut("collapse")} HIDE` + link "Open in Ask Cyclops →" href={`/chat?t=${sessionId}`}). Below lg viewport: docked renders as collapsed (the hidden/lg:flex handles it; keep the edge tab visible below lg).
- expanded: fixed inset overlay `z-50`: backdrop (bg-ink/30, click → docked) + right sheet `w-full max-w-2xl bg-canvas border-l border-border-agent flex flex-col h-full`, same header + full CyclopsChat (not compact) + same footer. `role="dialog" aria-modal="true" aria-label="Cyclops"`.

- [ ] **2.2** Layout: wrap content: `<div className="flex min-h-0 flex-1"><main className="min-w-0 flex-1">{children}</main><CyclopsDock badge={badges.today} /></div>` (AppNav stays above). Verify tracker/chat full-height calcs still work (they use 100vh-3rem; docked rail is a flex sibling, no change needed — confirm visually).
- [ ] **2.3** Gates: tsc/test/build; dev-server curl /tracker (307) + controller visual pass. Commit `feat(gbplus): the Cyclops dock — collapsed/docked/expanded, lazy thread, context line, suggestions`.

---

### Task 3: Today for real + attention actions (TDD actions)

**Files:** Create `src/server/actions/attention.ts`; Rewrite `src/app/(app)/today/page.tsx`; Test `src/test/attention-actions.test.ts`.

- [ ] **3.1** Actions ("use server"), conventions as elsewhere, ownership-checked:

```ts
export async function resolveAttention(id: string): Promise<{ ok?: true; error?: string }>
// updateMany({ where: { id, userId }, data: { status: "RESOLVED", resolvedAt: new Date() } }); count===0 → error "Not found."
export async function snoozeAttention(id: string): Promise<{ ok?: true; error?: string }>
// status "SNOOZED", snoozedUntil = tomorrow 07:00 Europe/London (compute via Date + set hours UTC≈6; document approximation)
```

revalidatePath("/today") in both. TDD: resolve happy/foreign-id, snooze sets future date.
- [ ] **3.2** Today page (server). Data (Promise.all): open attention items (`findMany { userId, status: "OPEN" } orderBy createdAt asc`, try/catch → []), today's brief session (`chatSession.findFirst { userId, title: "Morning brief - <today>" }` + its first message text via include/parse), tracker deadlines (reuse `getTrackerItems(userId)`, filter status OPEN + deadlineAt future, sort by deadline, take 3). Render top-down:
  1. Greeting block (keep existing greeting()/dateLine()).
  2. Overnight summary sentence under greeting: derived from brief presence — with brief: "Cyclops prepared your brief overnight." / without: "Quiet night — nothing moved. Next sweep runs overnight."
  3. **Brief card** (only when session exists): `border-l-[3px] border-l-agent-mark rounded-card border border-border bg-surface shadow-card`; header row: label chip `◆ MORNING BRIEF` (bg-accent-soft text-accent rounded-pill px-2.5) + label text-faint `PREPARED 07:00`; body: the brief markdown rendered as `whitespace-pre-wrap text-[0.875rem] leading-relaxed text-ink max-w-[70ch]` (strip the leading "# " heading line); footer: pri pill Link "Open as chat" → `/chat?t=<sessionId>`, and if its attention item is RESOLVED show label `READ ✓` instead of the unread dot. When attention BRIEF item exists & OPEN, clicking "Open as chat" naturally resolves (existing auto-resolve).
  4. **Needs you** card (when items): one row per OPEN item — glyph by kind (◆ PROPOSAL, ? QUESTION, ◆ BRIEF, ▲ FLAG), title, mono meta (createdAt time), actions right: kind QUESTION → Link pill "Answer in chat" `/chat?prefill=<encoded title>` + ghost form-button "Dismiss" (resolveAttention); BRIEF → Link "Read" `/chat?t=<targetId>`; PROPOSAL with targetType "draft" → `<DraftReviewCard …/>` rendered as an expandable row (Task 4 component — in this task render the row with a "Review ↓" details/summary wrapper and slot the card inside); FLAG → form-button "Confirm" (resolveAttention). Every row also gets ghost "later" (snoozeAttention). Empty state (no items): quiet card "Queue clear — nothing needs you."
  5. **Coming up** card: 3 rows (monogram, employer bold + role muted, right: days mono (text-danger ≤14 with ▼) + date) each linking `/tracker/<id>`; "full tracker →" link in head. Empty: "No deadlines on the horizon."
- [ ] **3.3** Gates + commit `feat(gbplus): Today — brief hero with absence state, needs-you queue, coming up`.

---

### Task 4: Draft review card (TDD actions)

**Files:** Create `src/components/draft-review-card.tsx`, add actions to `src/server/actions/drafts.ts`; Test `src/test/draft-actions.test.ts`.

- [ ] **4.1** Actions ("use server"):

```ts
export async function acceptDraft(draftId: string, editedContent?: string): Promise<{ ok?: true; error?: string }>
```
auth → load GeneratedDraft `{ id, userId }` (error if absent) → derive question from `draft.context` (Json: read `.question` string; fallback "(untitled answer)") → upsert AnswerBankItem exactly like api/ext/answer's explicit-save path (read it; reuse its normalize + indexing helpers — import the same functions, do NOT duplicate logic; if helpers are route-local, extract them to `src/server/answers.ts` and re-import in both) with `answer = editedContent?.trim() || draft.content` → if editedContent differs from draft.content record DraftEdit like the route does → `resolveAttentionByKey(userId, \`draft:${draftId}\`)` → revalidatePath("/today"). 
```ts
export async function skipDraft(draftId: string): Promise<{ ok?: true; error?: string }>
```
auth + ownership → resolveAttentionByKey only. TDD both (mock prisma + attention helper).
- [ ] **4.2** `draft-review-card.tsx` ("use client"): props `{ draftId, question, content, meta }`. GB+ proposal idiom: container `rounded-control border border-border-agent bg-surface overflow-hidden`; header `bg-surface-2 px-3.5 py-2 flex` with chip `◆ DRAFT READY` (label, bg-accent-soft text-accent rounded-pill) + label text-faint meta (kind/employer); body: question as `text-[0.8125rem] font-bold`, content `whitespace-pre-wrap text-[0.8125rem] text-muted max-h-48 overflow-y-auto`; **Edit first** toggles the body into a `<textarea>` (10 rows, full width, border-border-interactive) prefilled with content + "view original" toggle; action row: pri pill **Accept** (acceptDraft(draftId, edited ?? undefined) via useTransition, pending → "Saving…"), sec pill **Edit first** / (in edit mode) **Save edited**, ghost **Skip** (skipDraft). After ok: card collapses to receipt line `✓ Saved to answer bank · <a href="/settings">view</a>` (or `Skipped — kept in drafts`) — local state. Errors render inline (text-danger label).
- [ ] **4.3** Wire into Today (Task 3's PROPOSAL slot): page loads the GeneratedDraft rows for open PROPOSAL items (`generatedDraft.findMany({ where: { id: { in: targetIds }, userId } })`) and passes content. Gates + commit `feat(gbplus): draft review — accept to answer bank / skip, wired into Today queue`.

---

### Task 5: Ask Cyclops rail regroup

**Files:** Modify `src/app/(app)/chat/page.tsx`.

- [ ] **5.1** Compute groups server-side: `needsYouIds` = Set of targetIds from `getOpenAttentionByTarget(userId, "chat-session")`; partition the 50 threads: Needs you (id ∈ set) → Today (updatedAt same London day) → This week (≤7d) → Earlier. Render group caption rows (`label text-faint px-3 pt-3 pb-1`: NEEDS YOU / TODAY / THIS WEEK / EARLIER — only non-empty groups). Thread rows keep current markup; add: `◆ AUTO` label suffix (text-accent) when title starts with "Morning brief"; needs-you rows get the amber treatment (`bg-accent-tint shadow-[inset_3px_0_0_var(--color-agent-mark)]` when not active; active keeps existing ink/active style per the selection law — check current active style and keep selection=ink consistent: active = existing `border-l-2 border-accent`… update active style to ink inset to honor the law: `shadow-[inset_3px_0_0_var(--color-ink)] bg-surface-2`).
- [ ] **5.2** Exclude the "Dock" thread from the rail list (`where: { NOT: { title: "Dock" } }`) — it's an ambient surface, not a conversation to manage. Gates + commit `feat(gbplus): chat rail regrouped — needs-you/today/this-week, AUTO tags, ink selection`.

---

### Task 6: Final gate

- [ ] tsc, full tests, clean build; controller visual pass (dock states, ⌘J/Ctrl+J/Ctrl+\, Today variants by faking data absent/present, draft card, rail groups); whole-plan review agent; fix round; commit.

## Self-review
1. Coverage E+F: dock 3-state+chords+context+suggestions+lazy thread ✓ (T1/T2) · expanded overlay ✓ · settings exclusion ✓ · Today brief+absence+queue+coming-up ✓ (T3) · queue actions resolve/snooze ✓ · proposal card Accept/Edit/Skip + answer-bank path + receipt ✓ (T4) · rail regroup + AUTO + needs-you + selection law ✓ (T5). Deliberately deferred: ⌘K palette + activity log → Plan 4 (noted in spec §7/8 scope); proposal "stale" state (needs target-version tracking — Plan 4 candidate, documented).
2. No placeholders; conditional reuse instructions point at exact files.
3. Names consistent: getOrCreateDockThread/toUIMessages/dockContextLabel/dockSuggestions/resolveAttention/snoozeAttention/acceptDraft/skipDraft used identically across tasks.
