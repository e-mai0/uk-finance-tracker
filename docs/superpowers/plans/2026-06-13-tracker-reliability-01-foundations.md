# Tracker Reliability — Plan 1: Foundations & Reliability Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared reliability substrate — schema changes, cycle-based deadline inference, a health-gated close state machine, and robust fetching — and wire it into the existing import pipeline so the 3 live adapters immediately gain inferred deadlines and automatic closing.

**Architecture:** Pure, unit-tested modules (`deadline-infer.ts`, `status.ts`) plus hardening of `common.ts`, integrated through `normalize.ts` and `import.ts`. No new adapters here (those are Plan 2). DB changes are additive SQL the **user** runs; we update `schema.prisma` to match and `prisma generate`.

**Tech Stack:** Next.js 15 (App Router), Prisma 6 + Supabase Postgres, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-13-tracker-live-listings-reliability-design.md`

---

## File Structure

- Create `prisma/sql/2026-06-13-tracker-reliability.sql` — additive migration (user runs).
- Modify `prisma/schema.prisma` — enum values + `Opportunity`/`IngestionSource` columns.
- Create `src/ingestion/deadline-infer.ts` — pure `inferDeadline()` + UK cycle table.
- Create `src/test/deadline-infer.test.ts`.
- Create `src/ingestion/status.ts` — pure close/reopen state machine.
- Create `src/test/status.test.ts`.
- Modify `src/ingestion/adapters/common.ts` — `fetchWithRetry`, `isImpervaBlocked`, `parseRetryAfter`, backoff.
- Modify `src/test/` — add `fetch-robust.test.ts` for the pure helpers.
- Modify `src/ingestion/types.ts` — extend `NormalizedOpportunity`.
- Modify `src/ingestion/normalize.ts` — apply inference + flags.
- Modify `src/test/` — extend normalize coverage in a new `normalize.test.ts`.
- Modify `src/ingestion/import.ts` — health-gated close sweep + new fields.
- Modify `src/ingestion/sync.ts` — pass health flag + set `lastSuccessfulFetchAt`.
- Modify `src/app/(app)/tracker/page.tsx` + `src/components/tracker/board.tsx` — "est. · rolling" marker + source freshness.

---

## Task 1: Additive SQL migration + schema

**Files:**
- Create: `prisma/sql/2026-06-13-tracker-reliability.sql`
- Modify: `prisma/schema.prisma` (enum `SourceType`, model `Opportunity`, model `IngestionSource`)

- [ ] **Step 1: Write the migration SQL**

```sql
-- Tracker live-listings reliability (Plan 1 foundations).
-- Additive only. Apply to the shared Supabase DB before deploying the branch.

-- New ATS source kinds (Workday already exists). Goldman + Deutsche Bank route
-- via CAREERS_PAGE hostname dispatch, so they get no enum value.
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'ORACLE_CLOUD';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'EIGHTFOLD';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'AVATURE';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'RADANCY';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'TALNET';

-- Opportunity: deadline honesty + close lifecycle.
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "deadlineEstimated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "isRolling" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "consecutiveMisses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "closeReason" TEXT;

-- IngestionSource: per-ATS config + closure-sweep gate.
ALTER TABLE "IngestionSource" ADD COLUMN IF NOT EXISTS "config" JSONB;
ALTER TABLE "IngestionSource" ADD COLUMN IF NOT EXISTS "lastSuccessfulFetchAt" TIMESTAMP(3);
```

- [ ] **Step 2: Mirror the changes in `schema.prisma`**

In `enum SourceType` (after `WORKDAY`):
```prisma
  ORACLE_CLOUD
  EIGHTFOLD
  AVATURE
  RADANCY
  TALNET
```

In `model Opportunity` (after `confidence`):
```prisma
  deadlineEstimated  Boolean           @default(false)
  isRolling          Boolean           @default(false)
  consecutiveMisses  Int               @default(0)
  closedAt           DateTime?
  closeReason        String?
```

In `model IngestionSource` (after `watchState`):
```prisma
  config                Json?
  lastSuccessfulFetchAt DateTime?
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npm run db:generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 4: Ask the user to apply the SQL**

This migration must be run by the user against Supabase (project convention — schema changes are user-run). Note it in the manual-tasks doc and surface it at handoff. Do NOT block local TS work — `prisma generate` already knows the new shape.

- [ ] **Step 5: Commit**

```bash
git add prisma/sql/2026-06-13-tracker-reliability.sql prisma/schema.prisma
git commit -m "feat(ingest): additive schema for deadline honesty + close lifecycle"
```

---

## Task 2: Deadline inference module

UK finance summer internships are rolling-dominated; when a feed exposes no deadline we infer a conservative cycle-based estimate, flagged estimated + rolling.

**Files:**
- Create: `src/ingestion/deadline-infer.ts`
- Test: `src/test/deadline-infer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { inferDeadline } from "../ingestion/deadline-infer";

describe("inferDeadline", () => {
  it("estimates a same-cycle close in the autumn window and flags it", () => {
    // Seen in July 2026 → cycle close ~end of November 2026.
    const now = new Date("2026-07-15T00:00:00Z");
    const r = inferDeadline(now);
    expect(r.estimated).toBe(true);
    expect(r.isRolling).toBe(true);
    expect(r.deadlineAt.getUTCFullYear()).toBe(2026);
    expect(r.deadlineAt.getUTCMonth()).toBe(10); // November (0-indexed)
  });

  it("rolls to next year's close when seen after the window", () => {
    // Seen in December 2026 (window passed) → next close ~end of November 2027.
    const now = new Date("2026-12-20T00:00:00Z");
    const r = inferDeadline(now);
    expect(r.deadlineAt.getUTCFullYear()).toBe(2027);
    expect(r.deadlineAt.getUTCMonth()).toBe(10);
  });

  it("returns a deadline strictly in the future relative to the seen date", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const r = inferDeadline(now);
    expect(r.deadlineAt.getTime()).toBeGreaterThan(now.getTime());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/deadline-infer.test.ts`
Expected: FAIL — "Cannot find module '../ingestion/deadline-infer'".

- [ ] **Step 3: Write the implementation**

```typescript
export interface InferredDeadline {
  deadlineAt: Date;
  estimated: true;
  isRolling: true;
}

/**
 * Cycle-based estimate for UK finance summer internships when the feed exposes
 * no real deadline. The cycle opens Jul–Sep and most nominal deadlines cluster
 * by end of November (rolling — many close earlier once full). We deliberately
 * pick the END OF NOVEMBER of the active cycle as a conservative nominal close,
 * always in the future relative to when the role was first seen, and flag it
 * estimated + rolling so the UI can say "est. · rolling — may close early".
 *
 * Per-bank exact dates are NOT hardcoded (the least stable signal); this is one
 * honest heuristic applied uniformly.
 */
const CLOSE_MONTH = 10; // November (0-indexed)
const CLOSE_DAY = 30;

export function inferDeadline(seenAt: Date): InferredDeadline {
  const year = seenAt.getUTCFullYear();
  let close = new Date(Date.UTC(year, CLOSE_MONTH, CLOSE_DAY, 23, 0, 0));
  // If the window has already passed for this year, roll to next cycle.
  if (close.getTime() <= seenAt.getTime()) {
    close = new Date(Date.UTC(year + 1, CLOSE_MONTH, CLOSE_DAY, 23, 0, 0));
  }
  return { deadlineAt: close, estimated: true, isRolling: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/deadline-infer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/deadline-infer.ts src/test/deadline-infer.test.ts
git commit -m "feat(ingest): cycle-based deadline inference (estimated + rolling)"
```

---

## Task 3: Close/reopen state machine

A pure function that decides status transitions from the current DB rows for one (employer, sourceType), the keys present in this run, and whether the fetch was healthy. Debounce 2 misses; never close on an unhealthy fetch; reopen on reappearance; close on a passed *real* deadline.

**Files:**
- Create: `src/ingestion/status.ts`
- Test: `src/test/status.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { decideTransitions, type ExistingRole } from "../ingestion/status";

const now = new Date("2026-07-01T00:00:00Z");

function role(p: Partial<ExistingRole> & { key: string }): ExistingRole {
  return {
    key: p.key,
    status: p.status ?? "OPEN",
    consecutiveMisses: p.consecutiveMisses ?? 0,
    deadlineAt: p.deadlineAt ?? null,
    deadlineEstimated: p.deadlineEstimated ?? false,
  };
}

describe("decideTransitions", () => {
  it("does nothing when the fetch was unhealthy", () => {
    const existing = [role({ key: "a" })];
    const out = decideTransitions(existing, new Set<string>(), false, now);
    expect(out).toEqual([]);
  });

  it("increments misses on first absence, no close yet", () => {
    const existing = [role({ key: "a" })];
    const out = decideTransitions(existing, new Set(["b"]), true, now);
    expect(out).toEqual([
      { key: "a", consecutiveMisses: 1, status: "OPEN" },
    ]);
  });

  it("closes after the second consecutive miss", () => {
    const existing = [role({ key: "a", consecutiveMisses: 1 })];
    const out = decideTransitions(existing, new Set(["b"]), true, now);
    expect(out[0]).toMatchObject({
      key: "a",
      status: "CLOSED",
      closeReason: "absent_debounce",
    });
  });

  it("resets misses and reopens a previously closed role that reappears", () => {
    const existing = [role({ key: "a", status: "CLOSED", consecutiveMisses: 2 })];
    const out = decideTransitions(existing, new Set(["a"]), true, now);
    expect(out[0]).toMatchObject({ key: "a", status: "OPEN", consecutiveMisses: 0 });
  });

  it("closes a present role whose REAL deadline has passed", () => {
    const past = new Date("2026-06-01T00:00:00Z");
    const existing = [role({ key: "a", deadlineAt: past, deadlineEstimated: false })];
    const out = decideTransitions(existing, new Set(["a"]), true, now);
    expect(out[0]).toMatchObject({ key: "a", status: "CLOSED", closeReason: "deadline_passed" });
  });

  it("does NOT close on a passed ESTIMATED deadline", () => {
    const past = new Date("2026-06-01T00:00:00Z");
    const existing = [role({ key: "a", deadlineAt: past, deadlineEstimated: true })];
    const out = decideTransitions(existing, new Set(["a"]), true, now);
    expect(out).toEqual([]); // present, estimated deadline → leave alone
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
import type { OpportunityStatus } from "@prisma/client";

const CLOSE_AFTER_MISSES = 2;

export interface ExistingRole {
  key: string; // employer+title+location dedup key
  status: OpportunityStatus;
  consecutiveMisses: number;
  deadlineAt: Date | null;
  deadlineEstimated: boolean;
}

export interface Transition {
  key: string;
  status: OpportunityStatus;
  consecutiveMisses: number;
  closeReason?: string;
}

/**
 * Decide status transitions for one (employer, sourceType) cohort. Pure.
 * - Unhealthy fetch → no transitions at all (the false-closure guard).
 * - Present + passed REAL deadline → CLOSED(deadline_passed).
 * - Present otherwise → reopen if it was closed; reset misses.
 * - Absent from a healthy feed → increment misses; CLOSED(absent_debounce) at threshold.
 * Returns only rows that actually change.
 */
export function decideTransitions(
  existing: ExistingRole[],
  presentKeys: Set<string>,
  healthy: boolean,
  now: Date,
): Transition[] {
  if (!healthy) return [];
  const out: Transition[] = [];
  for (const r of existing) {
    const present = presentKeys.has(r.key);
    if (present) {
      const deadlinePassed =
        r.deadlineAt !== null && !r.deadlineEstimated && r.deadlineAt.getTime() < now.getTime();
      if (deadlinePassed && r.status !== "CLOSED") {
        out.push({ key: r.key, status: "CLOSED", consecutiveMisses: 0, closeReason: "deadline_passed" });
        continue;
      }
      if (deadlinePassed) continue; // already closed
      if (r.status === "CLOSED" || r.consecutiveMisses !== 0) {
        out.push({ key: r.key, status: "OPEN", consecutiveMisses: 0 });
      }
      continue;
    }
    // Absent
    if (r.status === "CLOSED") continue; // already closed, nothing to do
    const misses = r.consecutiveMisses + 1;
    if (misses >= CLOSE_AFTER_MISSES) {
      out.push({ key: r.key, status: "CLOSED", consecutiveMisses: misses, closeReason: "absent_debounce" });
    } else {
      out.push({ key: r.key, status: "OPEN", consecutiveMisses: misses });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/status.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/status.ts src/test/status.test.ts
git commit -m "feat(ingest): health-gated close/reopen state machine"
```

---

## Task 4: Robust fetching helpers in `common.ts`

Add pure helpers (`parseRetryAfter`, `isImpervaBlocked`, `backoffDelays`) and a `fetchWithRetry` wrapper. Only the pure helpers are unit-tested; the network wrapper composes them.

**Files:**
- Modify: `src/ingestion/adapters/common.ts`
- Test: `src/test/fetch-robust.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { parseRetryAfter, isImpervaBlocked, backoffDelays } from "../ingestion/adapters/common";

describe("parseRetryAfter", () => {
  it("parses delay-seconds", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
  });
  it("returns null for missing/garbage", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("isImpervaBlocked", () => {
  it("detects an Incapsula interstitial body", () => {
    expect(isImpervaBlocked('<html>Request unsuccessful. Incapsula incident ID: 123</html>')).toBe(true);
  });
  it("passes clean HTML", () => {
    expect(isImpervaBlocked("<html><body><a href=/opp/1>Role</a></body></html>")).toBe(false);
  });
});

describe("backoffDelays", () => {
  it("produces an increasing capped schedule", () => {
    const d = backoffDelays(3, 500, 4000);
    expect(d).toHaveLength(3);
    expect(d[0]).toBe(500);
    expect(d[1]).toBe(1000);
    expect(d[2]).toBe(2000);
    expect(Math.max(...backoffDelays(10, 500, 4000))).toBeLessThanOrEqual(4000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/fetch-robust.test.ts`
Expected: FAIL — exports not found.

- [ ] **Step 3: Add the helpers to `common.ts`**

Append to `src/ingestion/adapters/common.ts`:
```typescript
/** Parse an HTTP Retry-After header (delay-seconds form) into milliseconds. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header.trim());
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : null;
}

/** Detect an Imperva/Incapsula challenge served with a 200 (disguised block). */
export function isImpervaBlocked(body: string): boolean {
  const head = body.slice(0, 4000).toLowerCase();
  return (
    head.includes("incapsula incident id") ||
    head.includes("_incapsula_resource") ||
    head.includes("request unsuccessful")
  );
}

/** Deterministic exponential backoff schedule (no jitter — caller adds it). */
export function backoffDelays(attempts: number, base: number, cap: number): number[] {
  return Array.from({ length: attempts }, (_, i) => Math.min(base * 2 ** i, cap));
}

/**
 * Fetch text with retry/backoff. Retries only 429/502/503/504 + network errors,
 * honors Retry-After, and treats an Imperva interstitial (200-disguised) as a
 * failure. Throws ImpervaBlockedError on a persistent interstitial so the sync
 * layer can mark the host unreachable rather than publishing garbage.
 */
export class ImpervaBlockedError extends Error {}

export async function fetchTextRobust(
  url: string,
  opts: { attempts?: number; headers?: Record<string, string> } = {},
): Promise<string> {
  const attempts = opts.attempts ?? 3;
  const delays = backoffDelays(attempts, 600, 8000);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, ...opts.headers },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if ([429, 502, 503, 504].includes(res.status)) {
        const wait = parseRetryAfter(res.headers.get("retry-after")) ?? delays[i];
        if (i < attempts - 1) { await sleep(wait); continue; }
        throw new Error(`GET ${url} → ${res.status} after ${attempts} attempts`);
      }
      if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
      const body = await res.text();
      if (isImpervaBlocked(body)) throw new ImpervaBlockedError(`Imperva interstitial at ${url}`);
      return body;
    } catch (err) {
      lastErr = err;
      if (err instanceof ImpervaBlockedError) throw err; // don't retry a challenge
      if (i < attempts - 1) await sleep(delays[i]);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

Note: `USER_AGENT` already exists in this file. Add a sibling `fetchJsonRobust` only if a Plan 2 adapter needs POST/JSON retries — defer (YAGNI).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/fetch-robust.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/adapters/common.ts src/test/fetch-robust.test.ts
git commit -m "feat(ingest): robust fetch helpers — backoff, Retry-After, Imperva guard"
```

---

## Task 5: Apply inference + flags in `normalize.ts`

When a raw opportunity has no `deadlineAt`, infer one and set the flags. A real deadline is left untouched.

**Files:**
- Modify: `src/ingestion/types.ts` (extend `NormalizedOpportunity`)
- Modify: `src/ingestion/normalize.ts`
- Test: `src/test/normalize.test.ts`

- [ ] **Step 1: Extend the type**

In `src/ingestion/types.ts`, add to `NormalizedOpportunity` (after `confidence`):
```typescript
  deadlineEstimated: boolean;
  isRolling: boolean;
```

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { normalizeOpportunity } from "../ingestion/normalize";
import type { RawOpportunity } from "../ingestion/types";

const base: RawOpportunity = {
  employer: "Acme", title: "Summer Analyst", roleFamily: "IB",
  location: "London", status: "OPEN", summary: "x",
};
const now = new Date("2026-07-15T00:00:00Z");

describe("normalizeOpportunity deadline handling", () => {
  it("keeps a real deadline and does not flag it estimated", () => {
    const n = normalizeOpportunity({ ...base, deadlineAt: "2026-10-31" }, now);
    expect(n.deadlineEstimated).toBe(false);
    expect(n.isRolling).toBe(false);
    expect(n.deadlineAt?.getUTCMonth()).toBe(9); // October
  });

  it("infers a deadline when none is published and flags it", () => {
    const n = normalizeOpportunity(base, now);
    expect(n.deadlineEstimated).toBe(true);
    expect(n.isRolling).toBe(true);
    expect(n.deadlineAt).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/normalize.test.ts`
Expected: FAIL — `deadlineEstimated` undefined.

- [ ] **Step 4: Wire inference into `normalize.ts`**

Add the import at the top:
```typescript
import { inferDeadline } from "./deadline-infer";
```

Replace the `deadlineAt` line and the return tail in `normalizeOpportunity` so the function computes the deadline first:
```typescript
  const realDeadline = parseDate(raw.deadlineAt);
  const inferred = realDeadline ? null : inferDeadline(parseDate(raw.firstSeen) ?? now);
  return {
    // ...all existing fields unchanged up to deadlineAt...
    deadlineAt: realDeadline ?? inferred!.deadlineAt,
    // ...firstSeenAt, lastSeenAt, etc. unchanged...
    deadlineEstimated: inferred !== null,
    isRolling: inferred !== null,
    confidence: computeConfidence(raw),
  };
```
(Keep every other field exactly as it was; only `deadlineAt` changes and the two new fields are added.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/normalize.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full suite to catch fallout**

Run: `npm test`
Expected: All green (existing adapter/classify/jsonld tests unaffected; they assert on fields we didn't change).

- [ ] **Step 7: Commit**

```bash
git add src/ingestion/types.ts src/ingestion/normalize.ts src/test/normalize.test.ts
git commit -m "feat(ingest): infer deadlines in normalize, flag estimated + rolling"
```

---

## Task 6: Health-gated close sweep + new fields in `import.ts`

After upserting a dataset, run the state machine over the employer's existing rows for that `sourceType` and apply transitions. Persist the new fields on every upsert.

**Files:**
- Modify: `src/ingestion/import.ts`

- [ ] **Step 1: Persist new fields on upsert**

In the `data` object inside `importDataset`, add:
```typescript
      deadlineEstimated: n.deadlineEstimated,
      isRolling: n.isRolling,
```

- [ ] **Step 2: Add the close sweep after the opportunity loop**

After the `for (const n of normalized)` loop closes and before the `ingestionRun.update`, insert:
```typescript
  // Health-gated close sweep: for each employer+sourceType cohort touched this
  // run, mark roles absent from this (healthy) feed as missed/closed, reopen
  // reappearances, and close roles past a REAL deadline. `healthy` is true here
  // because importDataset only runs after a successful adapter fetch.
  const presentByCohort = new Map<string, Set<string>>(); // `${employerId}:${sourceType}` -> keys
  for (const n of normalized) {
    const employerId = employerIdByName.get(n.employer)!;
    const cohort = `${employerId}:${n.sourceType}`;
    const key = `${n.title} ${n.location}`;
    (presentByCohort.get(cohort) ?? presentByCohort.set(cohort, new Set()).get(cohort)!).add(key);
  }
  for (const [cohort, presentKeys] of presentByCohort) {
    const [employerId, sourceType] = cohort.split(":");
    const rows = await prisma.opportunity.findMany({
      where: { employerId, sourceType: sourceType as (typeof normalized)[number]["sourceType"] },
      select: { id: true, title: true, location: true, status: true, consecutiveMisses: true, deadlineAt: true, deadlineEstimated: true },
    });
    const existing = rows.map((r) => ({
      key: `${r.title} ${r.location}`,
      status: r.status,
      consecutiveMisses: r.consecutiveMisses,
      deadlineAt: r.deadlineAt,
      deadlineEstimated: r.deadlineEstimated,
    }));
    const idByKey = new Map(rows.map((r) => [`${r.title} ${r.location}`, r.id]));
    const transitions = decideTransitions(existing, presentKeys, true, now);
    for (const t of transitions) {
      await prisma.opportunity.update({
        where: { id: idByKey.get(t.key)! },
        data: {
          status: t.status,
          consecutiveMisses: t.consecutiveMisses,
          ...(t.status === "CLOSED" ? { closedAt: now, closeReason: t.closeReason } : { closedAt: null, closeReason: null }),
        },
      });
    }
  }
```

Add the import at the top of `import.ts`:
```typescript
import { decideTransitions } from "./status";
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: green. (No unit test mocks Prisma here; `import.ts` is exercised by integration in the running app. The state-machine logic itself is covered by `status.test.ts`.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/import.ts
git commit -m "feat(ingest): health-gated close sweep + persist deadline/lifecycle fields"
```

---

## Task 7: Record fetch health in `sync.ts`

Set `lastSuccessfulFetchAt` on a clean adapter run so future observability (and any cross-run gating) can trust it.

**Files:**
- Modify: `src/ingestion/sync.ts`

- [ ] **Step 1: Set the timestamp on success**

In `syncSource`, inside the success branch's `prisma.ingestionSource.update` data, add:
```typescript
        lastSuccessfulFetchAt: new Date(),
```

- [ ] **Step 2: Add an unreachable status for Imperva blocks**

Wrap the adapter call so an `ImpervaBlockedError` records an honest `unreachable` status instead of a generic failure. Import it:
```typescript
import { ImpervaBlockedError } from "./adapters/common";
```
In the `catch (err)` of `syncSource`, before `recordFailure`:
```typescript
    if (err instanceof ImpervaBlockedError) {
      await prisma.ingestionSource.update({
        where: { id: source.id },
        data: { lastRunAt: new Date(), lastStatus: "unreachable (bot challenge)", lastError: message.slice(0, 500) },
      });
      return { sourceId: source.id, employerName: source.employerName, ok: false, created: 0, updated: 0, error: message };
    }
```

- [ ] **Step 3: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no errors, all green.

- [ ] **Step 4: Commit**

```bash
git add src/ingestion/sync.ts
git commit -m "feat(ingest): record fetch health; mark Imperva-blocked sources unreachable"
```

---

## Task 8: UI — "est. · rolling" deadline marker + source freshness

Make estimated deadlines visibly distinct so an inferred date never reads as fact.

**Files:**
- Modify: `src/app/(app)/tracker/page.tsx` (pass `deadlineEstimated`/`isRolling` into rows)
- Modify: `src/components/tracker/board.tsx` (render the marker)

- [ ] **Step 1: Confirm the query returns the new fields**

`getTrackerItems` selects from `Opportunity`; ensure `deadlineEstimated` and `isRolling` are included. Read `src/server/queries/opportunities.ts` and add them to the select if a select list is used. (If it selects the whole row, no change.)

- [ ] **Step 2: Thread the fields into the row mapping**

In `tracker/page.tsx`, in the `rows = items.map(...)`, add:
```typescript
    deadlineEstimated: it.deadlineEstimated === true,
    isRolling: it.isRolling === true,
```

- [ ] **Step 3: Render the marker in `board.tsx`**

Where the deadline / `daysLeft` cell renders, when `row.deadlineEstimated` is true, append a muted tag. Match existing GB+ label styling (see how `fresh`/`agentTags` render):
```tsx
{row.deadlineEstimated && (
  <span className="label text-subtle" title="Estimated from the recruiting cycle — rolling, may close early">
    est. · rolling
  </span>
)}
```
Update the `Board` row prop type to include `deadlineEstimated: boolean; isRolling: boolean`.

- [ ] **Step 4: Verify build + lint**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check (dev server)**

Run: `npm run dev`, open `/tracker`. Existing roles (Man Group / Point72 / Jane Street) — which have no real deadline — should now show an inferred date tagged "est. · rolling". (Requires the SQL from Task 1 applied + a sync run.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/tracker/page.tsx" src/components/tracker/board.tsx src/server/queries/opportunities.ts
git commit -m "feat(tracker): mark estimated deadlines 'est. · rolling' on the board"
```

---

## Self-Review

**Spec coverage (Plan 1 portion):** schema/SQL (Task 1) ✓; deadline inference real-vs-estimated (Tasks 2, 5) ✓; health-gated close machine incl. deadline-passed + reopen (Tasks 3, 6) ✓; robust fetching + Imperva guard + unreachable status (Tasks 4, 7) ✓; honesty UI marker (Task 8) ✓. The 8 adapters and the per-firm seed `config` are **Plan 2** (intentionally out of this plan). Firm dedupe (Citi/Barclays) is Plan 2.

**Placeholder scan:** no TBD/TODO; every code step shows code; commands have expected output.

**Type consistency:** `inferDeadline(seenAt)` returns `{deadlineAt, estimated, isRolling}` and is consumed in Task 5 as `inferred.deadlineAt`. `decideTransitions(existing, presentKeys, healthy, now)` signature matches its use in Task 6. `NormalizedOpportunity` gains `deadlineEstimated`/`isRolling`, set in Task 5 and persisted in Task 6. `ImpervaBlockedError` defined in Task 4, used in Tasks 4 & 7.

**Note for executor:** Tasks 6 and 8 depend on the Task 1 SQL being applied for end-to-end behavior, but all TS compiles against the regenerated Prisma client without the DB migration. Local `npm test` does not require the DB.
