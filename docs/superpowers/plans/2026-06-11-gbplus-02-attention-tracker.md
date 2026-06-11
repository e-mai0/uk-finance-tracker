# GB+ Plan 2 of 4 — Attention Store + Dense Tracker + Listing Peek (Spec Phases C+D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One canonical `AttentionItem` store feeding live nav badges, the GB+ dense tracker board (ticker tape kept at top, 34/44px rows, keyboard nav, ★ filter, agent row-tags), and the listing peek at `/tracker/[id]`.

**Architecture:** AttentionItem is a dedupe-keyed, polymorphic-lite table (`targetType`+`targetId`+unique `[userId,key]`). Producers: the overnight cron (brief → BRIEF, pending gardener questions → QUESTION, overnight drafts → PROPOSAL). Badges are filtered counts. All attention DB access is wrapped in try/catch returning empty defaults until the user applies the additive SQL (project rule: user runs SQL). The tracker keeps its proven pure data path (`getTrackerItems` → `parseFilters` → `applyFiltersAndSort`) and swaps the rendering for a semantic-table client board.

**Tech Stack:** Prisma 6 (additive SQL in prisma/sql/), Next.js 15 App Router, Tailwind 4 GB+ tokens, vitest (tests in `src/test/`).

**Read first:** `AGENTS.md` (Next docs warning). Spec: `docs/superpowers/specs/2026-06-11-cyclops-gbplus-ui-design.md` §4.3 (attention system), §7 Tracker/Listing-peek deltas. Branch: `gbplus-ui`.

**USER GATE:** After Task 1 lands, the user must run `prisma/sql/2026-06-11-attention-items.sql` against Supabase before badges/producers return live data. All code degrades gracefully (zero badges) until then.

**Out of scope (lands in Plan 3/4):** snooze semantics, the Needs-you queue UI, proposal cards, dock; deadline-moved FLAG producer ships only if change-detection already exists in the refresh path (Task 2 verifies; if absent, document and skip — do NOT build detection).

---

### Task 1: AttentionItem schema + SQL + badge queries (TDD)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/sql/2026-06-11-attention-items.sql`
- Create: `src/server/queries/attention.ts`
- Test: `src/test/attention-queries.test.ts`

- [ ] **Step 1: Add to `prisma/schema.prisma`** (enums near the other enums; model near GardenerQuestion; add the back-relation `attentionItems AttentionItem[]` to the `User` model):

```prisma
enum AttentionKind {
  PROPOSAL
  FLAG
  QUESTION
  BRIEF
}

enum AttentionStatus {
  OPEN
  SNOOZED
  RESOLVED
}

/// One canonical "pending decision" store (spec §4.3). Every nav badge is a
/// filtered count over OPEN rows; resolving anywhere decrements all views.
model AttentionItem {
  id           String          @id @default(cuid())
  userId       String
  user         User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind         AttentionKind
  status       AttentionStatus @default(OPEN)
  /// Stable dedupe key so cron re-runs upsert instead of duplicating,
  /// e.g. "brief:2026-06-11", "gq:<id>", "draft:<id>".
  key          String
  /// "chat-session" | "draft" | "opportunity" | "application" | "gardener-question"
  targetType   String
  targetId     String
  title        String
  meta         Json?
  snoozedUntil DateTime?
  createdAt    DateTime        @default(now())
  resolvedAt   DateTime?

  @@unique([userId, key])
  @@index([userId, status])
}
```

- [ ] **Step 2: Create `prisma/sql/2026-06-11-attention-items.sql`** (match the header style of `prisma/sql/2026-06-10-cyclops-phase2.sql` — read it first):

```sql
-- 2026-06-11 · GB+ Phase C: attention store
-- One canonical "pending decision" table; nav badges are filtered counts.
-- Fully additive. Run against the shared Supabase DB before deploying
-- code that depends on live badge counts (code no-ops gracefully until then).

-- CreateEnum
CREATE TYPE "AttentionKind" AS ENUM ('PROPOSAL', 'FLAG', 'QUESTION', 'BRIEF');

-- CreateEnum
CREATE TYPE "AttentionStatus" AS ENUM ('OPEN', 'SNOOZED', 'RESOLVED');

-- CreateTable
CREATE TABLE "AttentionItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AttentionKind" NOT NULL,
    "status" "AttentionStatus" NOT NULL DEFAULT 'OPEN',
    "key" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meta" JSONB,
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AttentionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttentionItem_userId_key_key" ON "AttentionItem"("userId", "key");

-- CreateIndex
CREATE INDEX "AttentionItem_userId_status_idx" ON "AttentionItem"("userId", "status");

-- AddForeignKey
ALTER TABLE "AttentionItem" ADD CONSTRAINT "AttentionItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Run `npx prisma generate` (NOT `db push` — the user applies SQL manually) and `npx tsc --noEmit` to confirm the client typechecks.

- [ ] **Step 3: Write the failing test** `src/test/attention-queries.test.ts` (follow the repo's existing prisma-mocking convention — read one existing test that mocks `@/server/db` first; if none mocks prisma, use this pattern):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("@/server/db", () => ({ prisma: { attentionItem: { findMany } } }));

import { getBadgeCounts, getOpenAttentionByTarget } from "@/server/queries/attention";

beforeEach(() => findMany.mockReset());

describe("getBadgeCounts", () => {
  it("counts all open as today, application-targets as applications, distinct chat sessions as chat", async () => {
    findMany.mockResolvedValue([
      { targetType: "chat-session", targetId: "s1" },
      { targetType: "chat-session", targetId: "s1" },
      { targetType: "draft", targetId: "d1" },
      { targetType: "application", targetId: "a1" },
      { targetType: "opportunity", targetId: "o1" },
    ]);
    const counts = await getBadgeCounts("u1");
    expect(counts).toEqual({ today: 5, applications: 2, chat: 1 });
  });

  it("returns zeros when the table does not exist yet (pre-SQL gate)", async () => {
    findMany.mockRejectedValue(new Error("relation AttentionItem does not exist"));
    const counts = await getBadgeCounts("u1");
    expect(counts).toEqual({ today: 0, applications: 0, chat: 0 });
  });
});

describe("getOpenAttentionByTarget", () => {
  it("groups open items by opportunity target id", async () => {
    findMany.mockResolvedValue([
      { targetType: "opportunity", targetId: "o1", kind: "PROPOSAL", title: "2 drafts ready" },
      { targetType: "opportunity", targetId: "o2", kind: "FLAG", title: "deadline moved" },
    ]);
    const map = await getOpenAttentionByTarget("u1", "opportunity");
    expect(map.get("o1")?.[0].title).toBe("2 drafts ready");
    expect(map.get("o2")?.[0].kind).toBe("FLAG");
  });

  it("returns an empty map on table-missing", async () => {
    findMany.mockRejectedValue(new Error("relation does not exist"));
    const map = await getOpenAttentionByTarget("u1", "opportunity");
    expect(map.size).toBe(0);
  });
});
```

Run: `npx vitest run src/test/attention-queries.test.ts` — expect FAIL (module missing).

- [ ] **Step 4: Implement `src/server/queries/attention.ts`:**

```ts
import { prisma } from "@/server/db";

export type NavBadgeCounts = { today: number; applications: number; chat: number };

export type OpenAttention = {
  kind: "PROPOSAL" | "FLAG" | "QUESTION" | "BRIEF";
  title: string;
  targetType: string;
  targetId: string;
};

const APPLICATION_TARGET_TYPES = new Set(["application", "draft"]);

const ZERO: NavBadgeCounts = { today: 0, applications: 0, chat: 0 };

/** Spec §4.3: every badge is a filtered count over OPEN attention items. */
export async function getBadgeCounts(userId: string): Promise<NavBadgeCounts> {
  try {
    const open = await prisma.attentionItem.findMany({
      where: { userId, status: "OPEN" },
      select: { targetType: true, targetId: true },
    });
    let applications = 0;
    const chatSessions = new Set<string>();
    for (const item of open) {
      if (APPLICATION_TARGET_TYPES.has(item.targetType)) applications++;
      if (item.targetType === "chat-session") chatSessions.add(item.targetId);
    }
    return { today: open.length, applications, chat: chatSessions.size };
  } catch {
    // Table absent until the user applies prisma/sql/2026-06-11-attention-items.sql.
    return ZERO;
  }
}

/** Open items grouped by targetId for one targetType (tracker row tags). */
export async function getOpenAttentionByTarget(
  userId: string,
  targetType: string,
): Promise<Map<string, OpenAttention[]>> {
  const map = new Map<string, OpenAttention[]>();
  try {
    const open = await prisma.attentionItem.findMany({
      where: { userId, status: "OPEN", targetType },
      select: { kind: true, title: true, targetType: true, targetId: true },
    });
    for (const item of open) {
      const list = map.get(item.targetId) ?? [];
      list.push(item as OpenAttention);
      map.set(item.targetId, list);
    }
  } catch {
    // Pre-SQL gate: no tags.
  }
  return map;
}
```

- [ ] **Step 5: Run tests** — `npx vitest run src/test/attention-queries.test.ts` expect PASS; `npm test` expect 279 + new passing; `npm run build` passes.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/sql/2026-06-11-attention-items.sql src/server/queries/attention.ts src/test/attention-queries.test.ts
git commit -m "feat(gbplus): attention store — schema, additive SQL, badge queries (graceful pre-SQL)"
```

---

### Task 2: Producers + resolve helpers wired into the overnight cron

**Files:**
- Create: `src/server/attention.ts`
- Modify: `src/app/api/cron/overnight/route.ts` (read it fully first)
- Modify: `src/app/(app)/chat/page.tsx` (brief auto-resolve on open)
- Test: `src/test/attention-producers.test.ts`

- [ ] **Step 1: Write the failing test** `src/test/attention-producers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn();
const updateMany = vi.fn();
vi.mock("@/server/db", () => ({ prisma: { attentionItem: { upsert, updateMany } } }));

import { upsertAttention, resolveAttentionByKey, resolveAttentionByTarget } from "@/server/attention";

beforeEach(() => { upsert.mockReset(); updateMany.mockReset(); });

describe("upsertAttention", () => {
  it("upserts on the [userId,key] unique", async () => {
    upsert.mockResolvedValue({});
    await upsertAttention({
      userId: "u1", kind: "BRIEF", key: "brief:2026-06-11",
      targetType: "chat-session", targetId: "s1", title: "Morning brief — 11 Jun",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_key: { userId: "u1", key: "brief:2026-06-11" } },
      }),
    );
  });

  it("swallows table-missing errors (pre-SQL gate)", async () => {
    upsert.mockRejectedValue(new Error("relation does not exist"));
    await expect(
      upsertAttention({
        userId: "u1", kind: "QUESTION", key: "gq:1",
        targetType: "gardener-question", targetId: "1", title: "q",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("resolve helpers", () => {
  it("resolveAttentionByKey marks resolved with timestamp", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await resolveAttentionByKey("u1", "brief:2026-06-11");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1", key: "brief:2026-06-11" }),
        data: expect.objectContaining({ status: "RESOLVED" }),
      }),
    );
  });

  it("resolveAttentionByTarget resolves all open items for a target", async () => {
    updateMany.mockResolvedValue({ count: 2 });
    await resolveAttentionByTarget("u1", "chat-session", "s1");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ targetType: "chat-session", targetId: "s1" }),
      }),
    );
  });
});
```

Run: expect FAIL (module missing).

- [ ] **Step 2: Implement `src/server/attention.ts`:**

```ts
import { prisma } from "@/server/db";
import type { AttentionKind } from "@prisma/client";

type UpsertArgs = {
  userId: string;
  kind: AttentionKind;
  key: string;
  targetType: string;
  targetId: string;
  title: string;
  meta?: Record<string, unknown>;
};

/**
 * Idempotent write: cron re-runs update the same row instead of duplicating.
 * All writes no-op until the user applies the attention-items SQL.
 */
export async function upsertAttention(args: UpsertArgs): Promise<void> {
  try {
    await prisma.attentionItem.upsert({
      where: { userId_key: { userId: args.userId, key: args.key } },
      create: {
        userId: args.userId,
        kind: args.kind,
        key: args.key,
        targetType: args.targetType,
        targetId: args.targetId,
        title: args.title,
        meta: args.meta,
      },
      update: { title: args.title, meta: args.meta },
    });
  } catch {
    // Pre-SQL gate.
  }
}

export async function resolveAttentionByKey(userId: string, key: string): Promise<void> {
  try {
    await prisma.attentionItem.updateMany({
      where: { userId, key, status: { not: "RESOLVED" } },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  } catch {
    // Pre-SQL gate.
  }
}

export async function resolveAttentionByTarget(
  userId: string,
  targetType: string,
  targetId: string,
): Promise<void> {
  try {
    await prisma.attentionItem.updateMany({
      where: { userId, targetType, targetId, status: { not: "RESOLVED" } },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  } catch {
    // Pre-SQL gate.
  }
}
```

Run tests — PASS.

- [ ] **Step 3: Wire producers into `src/app/api/cron/overnight/route.ts`.** Read the route fully. After the brief's ChatSession+ChatMessage are created (only when a brief was actually composed), add:

```ts
await upsertAttention({
  userId: user.id,
  kind: "BRIEF",
  key: `brief:${todayIso}`, // reuse the route's existing date string for the brief title
  targetType: "chat-session",
  targetId: briefSession.id,
  title: `Morning brief — ${todayIso}`,
});
```

Where the route gathers the pending gardener questions for the brief, add one QUESTION per included question:

```ts
await upsertAttention({
  userId: user.id,
  kind: "QUESTION",
  key: `gq:${q.id}`,
  targetType: "gardener-question",
  targetId: q.id,
  title: q.question,
});
```

If (and only if) the route creates overnight `GeneratedDraft` rows (search the route + anything it calls for `generatedDraft.create`), add per draft:

```ts
await upsertAttention({
  userId: user.id,
  kind: "PROPOSAL",
  key: `draft:${draft.id}`,
  targetType: "draft",
  targetId: draft.id,
  title: `Draft ready — ${draft.kind.toLowerCase().replace("_", " ")}`,
  meta: { applicationId: draft.applicationId, opportunityId: draft.opportunityId },
});
```

If the cron path does NOT create drafts, document that in the commit body and skip. Same rule for deadline-change FLAGs: only if the refresh path already detects deadline changes (search for prior-deadline comparison); do not build detection.

- [ ] **Step 4: Auto-resolve the brief when its thread is opened.** In `src/app/(app)/chat/page.tsx`, where the active session is loaded for render, add (fire-and-forget, after auth + session resolution):

```ts
import { resolveAttentionByTarget } from "@/server/attention";
// after activeThread is known:
void resolveAttentionByTarget(session.user.id, "chat-session", activeThread.id);
```

Use the route's actual variable names. Resolving a non-attention session is a harmless no-op.

- [ ] **Step 5: Verify** — `npm test` (all green), `npm run build`. The cron route cannot be exercised locally without cron auth; verification is type-level + tests here (the route's own logic is untouched apart from added calls).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(gbplus): attention producers in overnight cron + brief auto-resolve on open"
```

---

### Task 3: Live nav badges + activity pill

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Replace the stubbed badges:**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AppNav } from "@/components/app-nav";
import { getBadgeCounts } from "@/server/queries/attention";
import { prisma } from "@/server/db";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.onboarded) redirect("/onboarding");

  const badges = await getBadgeCounts(session.user.id);

  // "worked overnight" while today's brief is still unread; otherwise idle.
  let activity = "idle";
  try {
    const today = new Date().toISOString().slice(0, 10);
    const brief = await prisma.attentionItem.findUnique({
      where: { userId_key: { userId: session.user.id, key: `brief:${today}` } },
      select: { status: true },
    });
    if (brief) activity = brief.status === "OPEN" ? "worked overnight" : "worked overnight · read";
  } catch {
    // Pre-SQL gate.
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav
        name={session.user.name ?? "You"}
        badges={badges}
        activity={activity}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `npm run build`, `npm test`. Dev-server check: badges render 0 (pre-SQL) without crashing.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat(gbplus): live nav badges + agent activity pill from attention store"
```

---

### Task 4: ★ starred filter (TDD)

**Files:**
- Modify: `src/lib/filters.ts` (read fully first — FilterParams type, parseFilters, applyFiltersAndSort)
- Modify: `src/components/tracker/filters-bar.tsx` (add the chip)
- Test: extend the existing filters test file in `src/test/` (find it by grepping `applyFiltersAndSort`)

- [ ] **Step 1: Failing test** (append to the existing filters test file, matching its fixture style):

```ts
it("filter=starred keeps only saved items", () => {
  const items = [
    makeItem({ id: "a", saved: true }),
    makeItem({ id: "b", saved: false }),
    makeItem({ id: "c", saved: undefined }),
  ];
  const out = applyFiltersAndSort(items, { ...emptyFilters, starred: true });
  expect(out.map((i) => i.id)).toEqual(["a"]);
});

it("parseFilters reads filter=starred", () => {
  expect(parseFilters({ filter: "starred" }).starred).toBe(true);
  expect(parseFilters({}).starred).toBe(false);
});
```

Adapt `makeItem`/`emptyFilters` to the file's actual fixtures. Run — FAIL.

- [ ] **Step 2: Implement** in `src/lib/filters.ts`: add `starred: boolean` to FilterParams; in `parseFilters` read `searchParams.filter === "starred"`; in `applyFiltersAndSort` apply `if (filters.starred) items = items.filter((i) => i.saved === true)` alongside the other filters. Run tests — PASS.

- [ ] **Step 3: Add the chip** in filters-bar.tsx following its existing chip/URL-param mechanics: a "★ Saved" toggle chip that sets/unsets `filter=starred` in the URL (preserve other params, same router.replace pattern the bar already uses).

- [ ] **Step 4: Verify + commit**

```bash
npm test && npm run build
git add -A
git commit -m "feat(gbplus): starred tracker filter — /saved redirect is now honest"
```

---

### Task 5: The dense board — semantic table, keyboard nav, density toggle, tape on top

**Files:**
- Create: `src/components/tracker/board.tsx` (client)
- Modify: `src/app/(app)/tracker/page.tsx`
- Keep: `src/components/tracker/ticker-tape.tsx` rendered FIRST in the page (user requirement — the live tape stays at the top)
- Delete after swap: `src/components/tracker/opportunity-table.tsx`, `src/components/tracker/top-matches.tsx`, `src/components/tracker/summary-cards.tsx` (their info moves into the stats line; verify no other importers first)

- [ ] **Step 1: Create `src/components/tracker/board.tsx`:**

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toggleSave } from "@/server/actions/saved";

export type BoardRow = {
  id: string;
  employerName: string;
  title: string;
  divisionDesk: string | null;
  location: string | null;
  status: string; // OpportunityStatus
  deadlineAt: string | null; // ISO
  daysLeft: number | null;
  score: number | undefined;
  saved: boolean;
  agentTags: { kind: string; title: string }[];
};

const FIT = {
  strong: "var(--color-tier-strong)",
  good: "var(--color-tier-good)",
  mod: "var(--color-tier-mod)",
  low: "var(--color-tier-low)",
} as const;

function fitColor(score: number | undefined): string {
  if (score == null) return FIT.low;
  if (score >= 75) return FIT.strong;
  if (score >= 50) return FIT.good;
  if (score >= 25) return FIT.mod;
  return FIT.low;
}

function monogram(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}

export function Board({ rows }: { rows: BoardRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [focusIdx, setFocusIdx] = useState(-1);
  const [density, setDensity] = useState<"compact" | "comfy">("compact");
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  // Density: persisted; comfy is the default on coarse pointers (spec §7).
  useEffect(() => {
    const stored = localStorage.getItem("tracker-density");
    if (stored === "compact" || stored === "comfy") setDensity(stored);
    else if (window.matchMedia("(pointer: coarse)").matches) setDensity("comfy");
  }, []);
  const setAndStoreDensity = (d: "compact" | "comfy") => {
    setDensity(d);
    localStorage.setItem("tracker-density", d);
  };

  // Keyboard: J/K move · ⏎ open · S star · A ask. Single-letter keys are
  // inert while focus is in an editable field (spec keyboard rule zero).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(rows.length - 1, i + 1));
      } else if (key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && focusIdx >= 0) {
        router.push(`/tracker/${rows[focusIdx].id}`);
      } else if (key === "s" && focusIdx >= 0) {
        startTransition(() => void toggleSave(rows[focusIdx].id));
      } else if (key === "a" && focusIdx >= 0) {
        router.push(`/chat?opportunity=${rows[focusIdx].id}`);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rows, focusIdx, router]);

  // Keep the focused row visible.
  useEffect(() => {
    if (focusIdx < 0) return;
    tbodyRef.current
      ?.querySelectorAll("tr")
      [focusIdx]?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);

  const rowH = density === "compact" ? "h-[2.125rem]" : "h-11";

  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="label text-faint">{rows.length} shown</span>
        <div className="ml-auto flex overflow-hidden rounded-pill border border-border">
          {(["comfy", "compact"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={density === d}
              onClick={() => setAndStoreDensity(d)}
              className={cn(
                "label px-3 py-1",
                density === d ? "bg-ink text-canvas" : "text-faint hover:text-ink",
              )}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-strong bg-surface-3 text-left">
            <th scope="col" className="label w-9 px-4 py-1.5 text-faint" aria-label="Monogram" />
            <th scope="col" className="label py-1.5 text-faint">Firm · Role</th>
            <th scope="col" className="label w-24 py-1.5 text-right text-faint">Deadline</th>
            <th scope="col" className="label w-16 py-1.5 text-right text-faint">Days</th>
            <th scope="col" className="label w-28 py-1.5 text-right text-faint">Fit</th>
            <th scope="col" className="label w-20 px-4 py-1.5 text-right text-faint">Status</th>
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {rows.map((row, i) => {
            const closed = row.status === "CLOSED";
            const focused = i === focusIdx;
            return (
              <tr
                key={row.id}
                onClick={() => router.push(`/tracker/${row.id}`)}
                onMouseEnter={() => setFocusIdx(i)}
                aria-selected={focused}
                className={cn(
                  "group cursor-pointer border-b border-hairline transition-colors",
                  rowH,
                  focused && "bg-surface-2",
                  row.agentTags.length > 0 && "bg-accent-tint shadow-[inset_3px_0_0_var(--color-agent-mark)]",
                )}
              >
                <td className="px-4">
                  <span
                    aria-hidden
                    className={cn(
                      "tabular flex h-5 w-5 items-center justify-center rounded-sm border text-[0.6875rem]",
                      row.agentTags.length > 0
                        ? "border-border-agent bg-accent-soft text-accent"
                        : "border-border bg-surface-2 text-subtle",
                    )}
                  >
                    {monogram(row.employerName)}
                  </span>
                </td>
                <td className="max-w-0 truncate pr-3">
                  <span className={cn("text-[0.8125rem] font-extrabold", closed ? "text-subtle" : "text-ink")}>
                    {row.employerName}
                  </span>
                  <span className={cn("text-[0.75rem] font-bold", closed ? "text-faint" : "text-subtle")}>
                    {" · "}{row.title}
                    {row.divisionDesk ? ` · ${row.divisionDesk}` : ""}
                  </span>
                  {row.agentTags.map((tag) => (
                    <span
                      key={tag.title}
                      className="label ml-2 rounded-pill border border-border-agent bg-accent-soft px-1.5 text-accent"
                    >
                      <span aria-hidden>{tag.kind === "FLAG" ? "▲ " : "◆ "}</span>
                      <span className="sr-only">{tag.kind === "FLAG" ? "deadline flag: " : "Cyclops: "}</span>
                      {tag.title}
                    </span>
                  ))}
                  {row.saved && (
                    <span className="ml-2 text-[0.75rem] text-warning" aria-label="saved">★</span>
                  )}
                </td>
                <td className="tabular py-0 text-right text-[0.75rem] text-muted">
                  {row.deadlineAt
                    ? new Date(row.deadlineAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                    : "—"}
                </td>
                <td
                  className={cn(
                    "tabular text-right text-[0.75rem]",
                    row.daysLeft != null && row.daysLeft <= 21 && !closed ? "text-danger" : "text-muted",
                  )}
                >
                  {row.daysLeft != null && row.daysLeft <= 21 && !closed && <span aria-hidden>▲ </span>}
                  {closed || row.daysLeft == null ? "—" : row.daysLeft}
                </td>
                <td className="text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span aria-hidden className="relative inline-block h-1.5 w-10 overflow-hidden rounded-bar bg-surface-3">
                      <span
                        className="absolute inset-y-0 left-0 rounded-bar"
                        style={{ width: `${row.score ?? 0}%`, background: fitColor(row.score) }}
                      />
                    </span>
                    <span className="tabular w-6 text-right text-[0.75rem]" style={{ color: fitColor(row.score) }}>
                      {row.score ?? "—"}
                    </span>
                  </span>
                </td>
                <td className="px-4 text-right">
                  <span className="relative inline-block">
                    <span
                      className={cn(
                        "label",
                        closed ? "text-faint" : "text-muted",
                        "group-hover:opacity-0 group-focus-within:opacity-0",
                      )}
                    >
                      {row.status === "OPEN" ? "OPEN" : row.status === "OPENING_SOON" ? "SOON" : closed ? "CLOSED" : "—"}
                    </span>
                    {/* Row actions: always in DOM, shown on hover/focus (a11y rule). */}
                    <span className="absolute inset-y-0 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        aria-label={row.saved ? "Unsave" : "Save"}
                        onClick={(e) => {
                          e.stopPropagation();
                          startTransition(() => void toggleSave(row.id));
                        }}
                        className="label min-h-6 rounded-pill border border-border bg-surface px-2 text-subtle hover:border-agent-mark hover:text-accent"
                      >
                        ★
                      </button>
                      <button
                        type="button"
                        aria-label="Ask Cyclops about this listing"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/chat?opportunity=${row.id}`);
                        }}
                        className="label min-h-6 rounded-pill border border-border bg-surface px-2 text-subtle hover:border-agent-mark hover:text-accent"
                      >
                        ◆
                      </button>
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex gap-4 border-t border-hairline px-4 py-2">
        <span className="label text-faint">◆ = CYCLOPS · ▲ = CLOSING ≤21D · ★ = SAVED</span>
        <span className="label ml-auto text-faint">J/K MOVE · ⏎ OPEN · S SAVE · A ASK</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rebuild `src/app/(app)/tracker/page.tsx`.** Read the current page first; keep its data calls and add attention tags. Structure (top to bottom): **TickerTape (kept, full width, first element)** → title strip (slab "Tracker" + counts + synced time, reusing existing lastSeenAt logic if present) → stats line (inline: Open n / New·7d n / Closing·14d n / Match≥75 n — computed in the page from allItems exactly as summary-cards did; read summary-cards.tsx for the formulas before deleting it) → FiltersBar (unchanged mechanics) → `<Board rows={...} />`. Map TrackerItem → BoardRow:

```tsx
import { getOpenAttentionByTarget } from "@/server/queries/attention";
// after items are filtered+sorted:
const attention = await getOpenAttentionByTarget(session.user.id, "opportunity");
const rows = items.map((it) => ({
  id: it.id,
  employerName: it.employerName,
  title: it.title,
  divisionDesk: it.divisionDesk ?? null,
  location: it.location ?? null,
  status: it.status,
  deadlineAt: it.deadlineAt ? new Date(it.deadlineAt).toISOString() : null,
  daysLeft: daysUntil(it.deadlineAt), // reuse the page's existing helper
  score: it.score,
  saved: it.saved === true,
  agentTags: (attention.get(it.id) ?? []).map((a) => ({ kind: a.kind, title: a.title })),
}));
```

- [ ] **Step 3: Delete superseded components** — `grep -rn "opportunity-table\|OpportunityTable\|top-matches\|TopMatches\|summary-cards\|SummaryCards" src --include=*.tsx` → if only the tracker page imported them, `git rm` all three. If anything else imports them, leave that file and report.

- [ ] **Step 4: Verify** — `npm run build`, `npm test`; dev-server: tape scrolls at top, table renders, J/K/⏎/S/A work, density toggle persists, starred filter + chips work together.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(gbplus): dense tracker board — tape on top, semantic table, J/K/⏎/S/A, density toggle, agent row tags"
```

---

### Task 6: Listing peek at /tracker/[id] + Start application

**Files:**
- Create: `src/app/(app)/tracker/[id]/page.tsx` (GB+ peek — reuses `getOpportunityDetail`)
- Modify: `src/app/(app)/opportunities/[id]/page.tsx` → permanentRedirect stub
- Create: `startApplication` server action in `src/server/actions/applications.ts` (read it first; follow its conventions)
- Test: `src/test/start-application.test.ts`

- [ ] **Step 1: Failing test for the action:**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const create = vi.fn();
const findUnique = vi.fn();
vi.mock("@/server/db", () => ({
  prisma: {
    application: { findFirst, create },
    opportunity: { findUnique },
  },
}));
vi.mock("@/server/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { startApplication } from "@/server/actions/applications";

beforeEach(() => { findFirst.mockReset(); create.mockReset(); findUnique.mockReset(); });

it("creates a DRAFT application linked to the opportunity", async () => {
  findUnique.mockResolvedValue({
    id: "o1",
    title: "SWE Intern",
    applicationUrl: "https://jobs.example.com/x",
    employer: { name: "J.P. Morgan" },
  });
  findFirst.mockResolvedValue(null);
  create.mockResolvedValue({ id: "app1" });
  const res = await startApplication("o1");
  expect(res).toEqual({ ok: true, applicationId: "app1" });
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ userId: "u1", opportunityId: "o1", status: "DRAFT", source: "MANUAL" }),
    }),
  );
});

it("returns the existing application instead of duplicating", async () => {
  findUnique.mockResolvedValue({ id: "o1", title: "t", applicationUrl: "u", employer: { name: "e" } });
  findFirst.mockResolvedValue({ id: "existing" });
  const res = await startApplication("o1");
  expect(res).toEqual({ ok: true, applicationId: "existing" });
  expect(create).not.toHaveBeenCalled();
});
```

Adapt mock fields to the real Application model (read `src/server/actions/applications.ts` + schema first — externalUrl is unique per [userId, externalUrl]; use the opportunity's applicationUrl, falling back to a synthetic `tracker:o1` URL if null). Run — FAIL.

- [ ] **Step 2: Implement `startApplication(opportunityId)`** in `src/server/actions/applications.ts` following the file's existing auth/error/revalidate conventions: auth guard → load opportunity (with employer) → `findFirst` existing application for `[userId, opportunityId]` → return it if present → else `create` with status DRAFT, source MANUAL, employerName, roleTitle from the opportunity, externalUrl = applicationUrl ?? `tracker:${opportunityId}` → `revalidatePath("/applications")` → `{ ok: true, applicationId }`. Run tests — PASS.

- [ ] **Step 3: Create the peek page** `src/app/(app)/tracker/[id]/page.tsx`. Read the old `/opportunities/[id]/page.tsx` in full; carry over ALL of its data + functionality, restyled GB+: header (large monogram, slab title, label-meta line), action row (`Start application` pri pill — a form invoking startApplication then redirecting to /applications; existing SaveButton; "Ask Cyclops" → `/chat?opportunity=...`; external "Apply ↗" link), then two-column: left = About/description/eligibility/tags + CoverLetterCard + NotesEditor (reuse existing components untouched), right = Your fit (score + bar + reasons with ✓/! glyphs) + Key details + Sources. Show the application pipeline tag if an application exists ("◆ drafting" / "✓ submitted"). Back link `← Tracker` at top.

- [ ] **Step 4: Redirect the old route.** Replace `src/app/(app)/opportunities/[id]/page.tsx` with:

```tsx
import { permanentRedirect } from "next/navigation";

export default async function OpportunityRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/tracker/${id}`);
}
```

(Params are async in this Next version — match the old page's params handling.) Sweep internal links: `grep -rn '"/opportunities' src --include=*.tsx --include=*.ts` → repoint to `/tracker/`.

- [ ] **Step 5: Verify + commit**

```bash
npm test && npm run build
git add -A
git commit -m "feat(gbplus): listing peek at /tracker/[id] + startApplication; /opportunities permanently redirects"
```

---

### Task 7: Final verification sweep

- [ ] **Step 1:** `npm run build` + `npm test` green; `npx tsc --noEmit` clean.
- [ ] **Step 2:** Dev-server walkthrough (controller does visually): tape on top of /tracker; dense rows; filters incl. ★; J/K/⏎/S/A; peek page renders for a real listing id; /opportunities/<id> 308s; /saved lands on starred view; badges render zeros pre-SQL without errors.
- [ ] **Step 3:** Confirm `prisma/sql/2026-06-11-attention-items.sql` is the ONLY pending DB action and hand it to the user.
- [ ] **Step 4:** Commit anything outstanding; report.

---

## Self-review checklist

1. **Spec coverage (C+D):** attention store + dedupe keys ✓ (T1/T2) · badges as views ✓ (T1/T3) · producers brief/question/draft ✓ (T2, draft/FLAG conditional on existing machinery — documented) · brief auto-resolve ✓ (T2) · ticker tape kept on top ✓ (T5 — user requirement) · 34/44px densities + comfy-on-touch ✓ · semantic table ✓ · hover+focus actions, always in DOM ✓ · keyboard map subset J/K/⏎/S/A ✓ · ★ filter honoring /saved ✓ (T4) · agent row tags ✓ (T5/T7→merged into T5 Step 2) · listing peek + Start application + old-route redirect ✓ (T6) · graceful pre-SQL degradation everywhere ✓.
2. **Placeholders:** none; conditional items (FLAG producer, draft producer) have explicit verify-then-skip instructions rather than TBDs.
3. **Type consistency:** `getOpenAttentionByTarget` name used in T1 tests/impl and T5 page; `upsertAttention`/`resolveAttentionByKey`/`resolveAttentionByTarget` consistent T2; `BoardRow.agentTags` shape matches the page mapping; `NavBadgeCounts` matches AppNav's `NavBadges` shape (today/applications/chat).
