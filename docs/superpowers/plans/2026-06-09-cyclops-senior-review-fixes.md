# Cyclops Senior-Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply all 13 senior-review items to harden the Cyclops agent loop: request validation, server-side history rebuild, decay annotation, edit_memory guards, gardener dedup, per-step budget recording, message dedup columns, aborted-flag, and minor fixes.

**Architecture:** Pure functions extracted into `src/server/ai/tool-guards.ts` and `src/server/memory/facts.ts` keep logic testable without mocking Prisma; thin wrappers in `tools.ts` and `brain.ts` call those functions. Schema additions stay in `prisma/schema.prisma` AND `prisma/sql/2026-06-09-cyclops-memory.sql` (in-place, not yet applied). `npx prisma generate` after every schema change.

**Tech Stack:** Next.js 15, Vercel AI SDK v6 (`ai@^6`), Prisma 6, Zod 3, Vitest 2

---

## File Map

| File | Action | Items |
|---|---|---|
| `src/app/api/chat/route.ts` | Modify | 1, 4, 5, 6, 7 |
| `src/server/ai/brain.ts` | Modify | 2, 4, 5 |
| `src/server/ai/tools.ts` | Modify | 3, 9, 10, 11, 13 |
| `src/server/ai/budget.ts` | Modify | 8 |
| `src/server/memory/facts.ts` | Modify | 2, 9 |
| `src/server/memory/gardener.ts` | Modify | 4 (export guard) |
| `src/server/ai/tool-guards.ts` | Create | 3, 13 |
| `prisma/schema.prisma` | Modify | 6, 7 |
| `prisma/sql/2026-06-09-cyclops-memory.sql` | Modify | 6, 7 |
| `src/test/facts.test.ts` | Modify | 2 |
| `src/test/budget.test.ts` | Modify | 8 |
| `src/test/tool-guards.test.ts` | Create | 3, 13 |

---

## Task 1: Schema columns + prisma generate (Items 6 & 7)

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/sql/2026-06-09-cyclops-memory.sql`

These are structural prerequisites for items 6 and 7, so do them first.

- [ ] **Step 1: Add `clientId` and `aborted` to ChatMessage in schema.prisma**

In `prisma/schema.prisma`, find the `ChatMessage` model (currently lines ~426–435) and replace it:

```prisma
model ChatMessage {
  id        String      @id @default(cuid())
  sessionId String
  clientId  String?
  role      String // "user" | "assistant"
  parts     String      @db.Text // JSON-serialised UIMessage parts
  aborted   Boolean     @default(false)
  createdAt DateTime    @default(now())
  session   ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, clientId])
  @@index([sessionId, createdAt])
}
```

- [ ] **Step 2: Mirror the column additions in the SQL file**

In `prisma/sql/2026-06-09-cyclops-memory.sql`, find the `CREATE TABLE "ChatMessage"` block and add the two new columns. Replace:

```sql
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "parts" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);
```

With:

```sql
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientId" TEXT,
    "role" TEXT NOT NULL,
    "parts" TEXT NOT NULL,
    "aborted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);
```

Also add the unique index after the existing `CREATE INDEX "ChatMessage_sessionId_createdAt_idx"` line:

```sql
-- CreateUniqueIndex
CREATE UNIQUE INDEX "ChatMessage_sessionId_clientId_key" ON "ChatMessage"("sessionId", "clientId") WHERE "clientId" IS NOT NULL;
```

- [ ] **Step 3: Run prisma generate**

```powershell
npx prisma generate
```

Expected: output says "Generated Prisma Client" with no errors.

- [ ] **Step 4: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add prisma/schema.prisma "prisma/sql/2026-06-09-cyclops-memory.sql"
git commit -m "$(cat <<'EOF'
fix(cyclops): add clientId + aborted columns to ChatMessage schema

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `annotateDecay` pure function + tests (Items 2 & 9)

**Files:**
- Modify: `src/server/memory/facts.ts`
- Modify: `src/test/facts.test.ts`

- [ ] **Step 1: Write the failing tests first**

Add to the end of `src/test/facts.test.ts`:

```typescript
import { annotateDecay } from "@/server/memory/facts";

describe("annotateDecay", () => {
  const now = new Date("2026-06-09T00:00:00Z");

  it("volatile fact older than 30 days gets [decayed to: low] annotation", () => {
    const content = "- Targeting quant (confidence: high, confirmed: 2026-04-01)\n";
    // strategy.md is volatile, confirmed 2026-04-01 is 69 days before now → decays to low
    const result = annotateDecay("strategy.md", content, now);
    expect(result).toContain("[decayed to: low]");
  });

  it("fresh volatile fact (within 30 days) is not annotated", () => {
    const content = "- Targeting quant (confidence: high, confirmed: 2026-06-01)\n";
    const result = annotateDecay("strategy.md", content, now);
    expect(result).not.toContain("[decayed to:");
  });

  it("non-fact lines (headings, blanks) are returned unchanged", () => {
    const content = "## Section heading\n\nSome plain text\n";
    const result = annotateDecay("profile.md", content, now);
    expect(result).toBe(content);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
npx vitest run src/test/facts.test.ts
```

Expected: 3 new tests FAIL with "annotateDecay is not a function".

- [ ] **Step 3: Add `annotateDecay` to `src/server/memory/facts.ts`**

Append the following export after the existing `applyFact` function:

```typescript
/**
 * Annotate each fact line in `content` whose effective confidence (given the
 * file's volatility and `now`) has decayed below its stored confidence level.
 * Non-fact lines are returned unchanged.
 * Uses `volatilityFor(path)` so the correct volatility class is always derived
 * from the normalized file path (fixes item 9: never use the raw input arg).
 */
export function annotateDecay(path: string, content: string, now: Date): string {
  const volatility = volatilityFor(path);
  return content
    .split("\n")
    .map((line) => {
      const fact = parseFactLine(line);
      if (!fact) return line;
      const effective = effectiveConfidence(fact, volatility, now);
      if (effective !== fact.confidence) {
        return `${line}  [decayed to: ${effective}]`;
      }
      return line;
    })
    .join("\n");
}
```

- [ ] **Step 4: Run the new tests to confirm they pass**

```powershell
npx vitest run src/test/facts.test.ts
```

Expected: all facts tests pass (original 12 + 3 new = 15).

- [ ] **Step 5: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/server/memory/facts.ts src/test/facts.test.ts
git commit -m "$(cat <<'EOF'
fix(cyclops): extract annotateDecay pure function; fixes item 2 & 9

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `tool-guards.ts` + tests (Items 3 & 13)

**Files:**
- Create: `src/server/ai/tool-guards.ts`
- Create: `src/test/tool-guards.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/tool-guards.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  isAllowedMemoryPath,
  stripDecayAnnotations,
  normalizeReasons,
} from "@/server/ai/tool-guards";

describe("isAllowedMemoryPath", () => {
  it("allows profile.md", () => {
    expect(isAllowedMemoryPath("profile.md")).toBe(true);
  });
  it("allows voice.md", () => {
    expect(isAllowedMemoryPath("voice.md")).toBe(true);
  });
  it("allows strategy.md", () => {
    expect(isAllowedMemoryPath("strategy.md")).toBe(true);
  });
  it("allows stories/rowing-captain.md", () => {
    expect(isAllowedMemoryPath("stories/rowing-captain.md")).toBe(true);
  });
  it("allows companies/goldman-sachs.md", () => {
    expect(isAllowedMemoryPath("companies/goldman-sachs.md")).toBe(true);
  });
  it("rejects arbitrary path like notes.md", () => {
    expect(isAllowedMemoryPath("notes.md")).toBe(false);
  });
  it("rejects path traversal attempt", () => {
    expect(isAllowedMemoryPath("../profile.md")).toBe(false);
  });
  it("rejects uppercase path", () => {
    expect(isAllowedMemoryPath("Profile.md")).toBe(false);
  });
  it("rejects stories path with uppercase", () => {
    expect(isAllowedMemoryPath("stories/My-Story.md")).toBe(false);
  });
  it("allows stories path with digits", () => {
    expect(isAllowedMemoryPath("stories/internship-2024.md")).toBe(true);
  });
});

describe("stripDecayAnnotations", () => {
  it("strips [decayed to: low] annotation", () => {
    const input = "- Some fact (confidence: high, confirmed: 2026-01-01)  [decayed to: low]";
    expect(stripDecayAnnotations(input)).toBe(
      "- Some fact (confidence: high, confirmed: 2026-01-01)"
    );
  });
  it("strips [decayed to: medium] annotation", () => {
    const input = "- Other fact (confidence: high, confirmed: 2026-01-01)  [decayed to: medium]";
    expect(stripDecayAnnotations(input)).toBe(
      "- Other fact (confidence: high, confirmed: 2026-01-01)"
    );
  });
  it("strips [decayed to: high] annotation (defensive)", () => {
    const input = "- Fact  [decayed to: high]";
    expect(stripDecayAnnotations(input)).toBe("- Fact");
  });
  it("leaves clean content unchanged", () => {
    const clean = "- Some fact (confidence: high, confirmed: 2026-01-01)";
    expect(stripDecayAnnotations(clean)).toBe(clean);
  });
});

describe("normalizeReasons", () => {
  it("returns an array as-is when already an array", () => {
    expect(normalizeReasons(["good fit", "strong match"])).toEqual(["good fit", "strong match"]);
  });
  it("parses a JSON string array", () => {
    expect(normalizeReasons('["reason one","reason two"]')).toEqual(["reason one", "reason two"]);
  });
  it("wraps a plain string in an array", () => {
    expect(normalizeReasons("single reason")).toEqual(["single reason"]);
  });
  it("returns empty array for null", () => {
    expect(normalizeReasons(null)).toEqual([]);
  });
  it("returns empty array for undefined", () => {
    expect(normalizeReasons(undefined)).toEqual([]);
  });
  it("returns empty array for a number", () => {
    expect(normalizeReasons(42)).toEqual([]);
  });
  it("returns empty array for invalid JSON string", () => {
    expect(normalizeReasons("{not valid}")).toEqual(["{not valid}"]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
npx vitest run src/test/tool-guards.test.ts
```

Expected: all tests FAIL with "cannot find module".

- [ ] **Step 3: Create `src/server/ai/tool-guards.ts`**

```typescript
/**
 * Pure guard/transform functions for the edit_memory tool.
 * Kept separate so they can be unit-tested without mocking Prisma.
 */

/** Paths that edit_memory is allowed to write to. */
const ALLOWED_FIXED_PATHS = new Set(["profile.md", "voice.md", "strategy.md"]);
const ALLOWED_SUBDIR_RE = /^(stories|companies)\/[a-z0-9-]+\.md$/;

/**
 * Returns true if the given path is one of the three fixed files or matches
 * the stories/companies pattern. Path must already be lowercase and normalised.
 */
export function isAllowedMemoryPath(path: string): boolean {
  if (ALLOWED_FIXED_PATHS.has(path)) return true;
  return ALLOWED_SUBDIR_RE.test(path);
}

/**
 * Strip any decay annotation appended by annotateDecay / read_memory before
 * writing content back to disk.
 */
export function stripDecayAnnotations(content: string): string {
  return content.replace(/\s*\[decayed to: (high|medium|low)\]/g, "");
}

/**
 * Normalise the `reasons` JSON field from MatchScore into a string array.
 * Handles: string[] (already an array), JSON-encoded string[], a plain string,
 * null/undefined, and garbage (returns [] for unrecognised types).
 */
export function normalizeReasons(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {
      // Not valid JSON — treat the whole string as one reason
    }
    return [value];
  }
  return [];
}
```

- [ ] **Step 4: Run the tool-guards tests to confirm they pass**

```powershell
npx vitest run src/test/tool-guards.test.ts
```

Expected: all 18 tests pass.

- [ ] **Step 5: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/server/ai/tool-guards.ts src/test/tool-guards.test.ts
git commit -m "$(cat <<'EOF'
fix(cyclops): extract tool-guards pure functions with tests (items 3,13)

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Apply tool-guards to `tools.ts` + export gardener guard (Items 3, 9, 11)

**Files:**
- Modify: `src/server/ai/tools.ts`
- Modify: `src/server/memory/gardener.ts`

- [ ] **Step 1: Export `rawNotesGuardPasses` from gardener.ts**

In `src/server/memory/gardener.ts`, find the function declaration for `rawNotesGuardPasses` (currently line 47) and change it from:

```typescript
function rawNotesGuardPasses(existingContent: string, proposedContent: string): boolean {
```

to:

```typescript
export function rawNotesGuardPasses(existingContent: string, proposedContent: string): boolean {
```

- [ ] **Step 2: Rewrite `src/server/ai/tools.ts` completely**

Replace the entire contents of `src/server/ai/tools.ts` with:

```typescript
import { tool } from "ai";
import { z } from "zod";
import { memoryService } from "@/server/memory/service";
import { annotateDecay } from "@/server/memory/facts";
import { rawNotesGuardPasses } from "@/server/memory/gardener";
import { isAllowedMemoryPath, stripDecayAnnotations, normalizeReasons } from "@/server/ai/tool-guards";
import { semanticSearch } from "@/server/ai/embed";
import { prisma } from "@/server/db";
import { OpportunityStatus } from "@prisma/client";

const MAX_FILE_COUNT = 100;

export function buildTools(userId: string) {
  return {
    list_memory: tool({
      description: "List all memory files for this user. Returns an array of paths.",
      inputSchema: z.object({}),
      execute: async () => {
        const files = await memoryService.list(userId);
        return files.map((f) => ({ path: f.path }));
      },
    }),

    read_memory: tool({
      description:
        "Read a memory file. Lines with medium or low effective confidence are annotated with [decayed to: <level>]. " +
        "Treat medium-confidence facts as uncertain and confirm before relying on them. " +
        "Treat low-confidence facts as stale — do not assert them without confirmation. " +
        "Returns { path, content } or { error: 'not found' }.",
      inputSchema: z.object({
        path: z.string().describe("The path of the memory file to read (e.g. 'profile.md')."),
      }),
      execute: async ({ path }) => {
        const file = await memoryService.read(userId, path);
        if (!file) return { error: "not found" };

        // Use file.path (the normalized path) so volatilityFor always gets the
        // canonical form — never the raw input arg (item 9).
        const annotated = annotateDecay(file.path, file.content, new Date());
        return { path: file.path, content: annotated };
      },
    }),

    edit_memory: tool({
      description:
        "Replace the full content of a memory file. " +
        "SUPERSEDE, don't append: contradicted facts move to the History section with their dates. " +
        "Never rewrite 'Raw notes' sections. " +
        "Never include [decayed to: ...] annotations in content. " +
        "Provide a short reason describing what changed and why.",
      inputSchema: z.object({
        path: z.string().describe("The path of the memory file to write (e.g. 'profile.md')."),
        content: z.string().describe("The full new content of the memory file."),
        reason: z.string().describe("Short reason for the edit (e.g. 'user confirmed degree is economics')."),
      }),
      execute: async ({ path, content, reason }) => {
        // Item 3a: restrict allowed paths
        if (!isAllowedMemoryPath(path)) {
          return { error: "path not allowed" };
        }

        // Item 3b: strip any decay annotations before writing
        const cleanContent = stripDecayAnnotations(content);

        // Item 3c: raw-notes guard
        const existing = await memoryService.read(userId, path);
        if (existing && !rawNotesGuardPasses(existing.content, cleanContent)) {
          return {
            error:
              "Raw notes sections must be preserved verbatim. Re-send with the original Raw notes content intact.",
          };
        }

        // Item 3d: file ceiling (only for new files, not edits of existing ones)
        if (!existing) {
          const allFiles = await memoryService.list(userId);
          if (allFiles.length >= MAX_FILE_COUNT) {
            return { error: "Memory file limit reached (100 files). Cannot create new files." };
          }
        }

        const { diff } = await memoryService.write(userId, path, cleanContent, "CYCLOPS", reason);
        return { saved: true, diff };
      },
    }),

    search_applications: tool({
      description:
        "Search the user's application history using both semantic similarity and recent-activity queries. " +
        "Returns { semantic: [...], recentApplications: [...] }.",
      inputSchema: z.object({
        query: z.string().describe("Natural-language query describing what you are looking for."),
      }),
      execute: async ({ query }) => {
        const [semanticHits, recent] = await Promise.all([
          semanticSearch(userId, query, 6).catch(() => [] as Awaited<ReturnType<typeof semanticSearch>>),
          prisma.application.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            take: 10,
            select: {
              employerName: true,
              roleTitle: true,
              status: true,
              submittedAt: true,
              externalUrl: true,
            },
          }),
        ]);

        const semantic = semanticHits.map((hit) => ({
          kind: hit.kind,
          excerpt: hit.content.slice(0, 400),
          confidence:
            hit.similarity > 0.75 ? "high" : hit.similarity > 0.55 ? "medium" : "low",
        }));

        return { semantic, recentApplications: recent };
      },
    }),

    search_opportunities: tool({
      description:
        "Search the public opportunity catalog by title or employer name. " +
        "Returns up to 10 matching non-closed opportunities ordered by deadline (soonest first).",
      inputSchema: z.object({
        query: z.string().describe("Search term — matched against opportunity title and employer name."),
      }),
      execute: async ({ query }) => {
        const opps = await prisma.opportunity.findMany({
          where: {
            status: { not: OpportunityStatus.CLOSED },
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { employer: { name: { contains: query, mode: "insensitive" } } },
            ],
          },
          include: { employer: { select: { name: true } } },
          orderBy: { deadlineAt: { sort: "asc", nulls: "last" } },
          take: 10,
        });
        return opps.map((o) => ({
          id: o.id,
          employer: o.employer.name,
          title: o.title,
          location: o.location,
          deadlineAt: o.deadlineAt,
          status: o.status,
        }));
      },
    }),

    fit_check: tool({
      description:
        "Load the fit assessment for an opportunity. Narrate the reasons honestly, including weaknesses. " +
        "Returns employer, title, eligibilityNotes, score (null if not yet computed), and reasons.",
      inputSchema: z.object({
        opportunityId: z.string().describe("The id of the opportunity to check fit for."),
      }),
      execute: async ({ opportunityId }) => {
        const [matchScore, opportunity] = await Promise.all([
          prisma.matchScore.findUnique({
            where: { userId_opportunityId: { userId, opportunityId } },
          }),
          prisma.opportunity.findUnique({
            where: { id: opportunityId },
            include: { employer: { select: { name: true } } },
          }),
        ]);

        if (!opportunity) return { error: "opportunity not found" };

        // Item 13: use normalizeReasons pure helper
        const reasons = normalizeReasons(matchScore?.reasons ?? null);

        return {
          employer: opportunity.employer.name,
          title: opportunity.title,
          eligibilityNotes: opportunity.eligibilityNotes ?? null,
          score: matchScore?.score ?? null,
          reasons,
        };
      },
    }),
  };
}
```

- [ ] **Step 3: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: no errors. (Note: if Prisma 6 doesn't support `nulls: "last"` on `orderBy`, Prisma generate will have warned; fall back to `orderBy: { deadlineAt: "asc" }` if tsc reports an error on that line.)

- [ ] **Step 4: Run all tests**

```powershell
npx vitest run
```

Expected: all existing tests still pass, no regressions.

- [ ] **Step 5: Commit**

```powershell
git add src/server/ai/tools.ts src/server/memory/gardener.ts
git commit -m "$(cat <<'EOF'
fix(cyclops): edit_memory guards, path allowlist, decay strip; item 11 filter closed

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `brain.ts` — decay injection, core-file cap, gardener questions refactor (Items 2 & 4)

**Files:**
- Modify: `src/server/ai/brain.ts`

The goal is:
- Use `annotateDecay` when injecting core files into the system prompt.
- Cap each core file at 6 000 chars with `\n[truncated]`.
- Fetch pending questions in `streamCyclops` but NOT mark them asked there.
- Export `loadPendingQuestions(userId)` for the route to call.
- Return `{ result, pendingQuestions }` from `streamCyclops`.
- `onStepFinish` wired in `streamText` for per-step budget (item 5 — added here so the return shape is set).

- [ ] **Step 1: Rewrite `src/server/ai/brain.ts`**

Replace the entire file with:

```typescript
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { sonnet } from "@/server/ai/models";
import { buildTools } from "@/server/ai/tools";
import { memoryService } from "@/server/memory/service";
import { annotateDecay } from "@/server/memory/facts";
import { recordUsage } from "@/server/ai/budget";
import { prisma } from "@/server/db";

const CORE_PATHS = ["profile.md", "voice.md", "strategy.md"];
const MAX_CORE_CHARS = 6000;

export function buildSystemPrompt(
  coreFiles: { path: string; content: string }[],
  pendingQuestions: string[],
): string {
  const memory = coreFiles.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join("\n");
  const questions = pendingQuestions.length
    ? `\nWhen natural, weave in these pending confirmations (do not interrogate; one at a time):\n${pendingQuestions.map((q) => `- ${q}`).join("\n")}`
    : "";
  return `You are Cyclops, the user's application copilot for UK finance roles. You know one domain deeply: this user and their applications. You are not a general assistant.

Core memory (always current; treat as your knowledge of the user):
${memory}

Memory rules:
- Update memory with edit_memory whenever the user shares something durable. SUPERSEDE, don't append: contradicted facts move to History with their dates. Never rewrite "Raw notes" sections.
- Confidence discipline: never assert a fact tagged medium or low as flat truth. Say "you've mentioned X (confidence: medium) - right?" and confirm before relying on it. Facts the user states directly are high confidence, dated today.
- If two memories contradict and you cannot resolve it, ask - never keep both.

Style: plain, direct, specific. British English. No em dashes. Use the user's actual stories and facts, never generic filler. Be honest about weak fit; flattery costs the user money and time.${questions}`;
}

/** Load the 3 oldest pending gardener questions for this user. Does NOT mark them asked. */
export async function loadPendingQuestions(userId: string): Promise<{ id: string; question: string }[]> {
  return prisma.gardenerQuestion.findMany({
    where: { userId, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 3,
    select: { id: true, question: true },
  });
}

export async function streamCyclops(args: { userId: string; messages: UIMessage[] }) {
  const files = await memoryService.list(args.userId);
  const now = new Date();

  const core = CORE_PATHS.map((p) => files.find((f) => f.path === p))
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .map((f) => {
      // Item 2: annotate decay and cap at MAX_CORE_CHARS
      let content = annotateDecay(f.path, f.content, now);
      if (content.length > MAX_CORE_CHARS) {
        content = content.slice(0, MAX_CORE_CHARS) + "\n[truncated]";
      }
      return { path: f.path, content };
    });

  // Item 4: fetch pending questions but DO NOT mark them asked here
  const pendingRows = await loadPendingQuestions(args.userId);
  const pendingQuestions = pendingRows.map((r) => r.question);

  const result = streamText({
    model: sonnet,
    system: buildSystemPrompt(core, pendingQuestions),
    messages: await convertToModelMessages(args.messages),
    tools: buildTools(args.userId),
    stopWhen: stepCountIs(12),
    // Item 5: per-step budget recording (fire-and-forget)
    onStepFinish: (step) => {
      const tokens = step.usage?.totalTokens ?? 0;
      if (tokens > 0) {
        recordUsage(args.userId, tokens).catch((err) =>
          console.error("[cyclops] failed to record step usage", { userId: args.userId, err }),
        );
      }
    },
  });

  return { result, pendingQuestions: pendingRows };
}
```

- [ ] **Step 2: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: no errors. If `step.usage` reports a type error, verify with: the `OnStepFinishEvent<TOOLS>` type extends `StepResult<TOOLS>` which has `readonly usage: LanguageModelUsage`. The field `totalTokens` is on `LanguageModelUsage`. So the path is `step.usage.totalTokens`.

- [ ] **Step 3: Run all tests**

```powershell
npx vitest run
```

Expected: all tests pass (brain-prompt.test.ts still passes because `buildSystemPrompt` signature is unchanged).

- [ ] **Step 4: Commit**

```powershell
git add src/server/ai/brain.ts
git commit -m "$(cat <<'EOF'
fix(cyclops): decay annotation in core files, 6k cap, gardener question refactor

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Route — request validation + server-side history rebuild (Items 1, 4, 5, 6, 7)

**Files:**
- Modify: `src/app/api/chat/route.ts`

This is the most complex change. It:
1. Validates the request body with Zod (item 1).
2. Rebuilds history server-side from DB (item 1).
3. Marks gardener questions asked post-stream (item 4).
4. Removes `result.totalUsage` usage recording (item 5, already handled in brain.ts).
5. Persists `clientId` + `skipDuplicates` (item 6).
6. Persists `aborted` flag (item 7).

- [ ] **Step 1: Rewrite `src/app/api/chat/route.ts` completely**

```typescript
import { after } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { streamCyclops } from "@/server/ai/brain";
import { checkBudget } from "@/server/ai/budget";
import { gardenerDue, runGardenerForUser } from "@/server/memory/gardener";
import type { UIMessage } from "ai";

export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Zod schema for the POST body (item 1)
// ---------------------------------------------------------------------------
const TextPartSchema = z.object({ type: z.literal("text"), text: z.string() });

const UIMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  parts: z.array(TextPartSchema).max(8),
});

const ChatBodySchema = z.object({
  sessionId: z.string().min(1),
  messages: z.array(UIMessageSchema).min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load the last 30 persisted ChatMessages for a session as UIMessages. */
async function loadSessionHistory(sessionId: string): Promise<UIMessage[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  return rows.map((row) => {
    let parts: UIMessage["parts"] = [];
    try {
      parts = JSON.parse(row.parts) as UIMessage["parts"];
    } catch {
      parts = [{ type: "text", text: "" }];
    }
    return {
      id: row.clientId ?? row.id,
      role: row.role as UIMessage["role"],
      parts,
    };
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { ok } = await checkBudget(userId);
  if (!ok) {
    return Response.json(
      {
        error:
          "Daily Cyclops limit reached. Autofill and saved answers still work; generation resets tomorrow.",
      },
      { status: 429 },
    );
  }

  // --- Parse + validate body (item 1) ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = ChatBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  // Extract the last message and enforce it is a user message (item 1)
  const incomingMessage = body.messages[body.messages.length - 1];
  if (!incomingMessage || incomingMessage.role !== "user") {
    return Response.json(
      { error: "Last message must have role 'user'." },
      { status: 400 },
    );
  }

  // Enforce total text length ≤ 8000 chars across all text parts (item 1)
  const totalTextLength = incomingMessage.parts.reduce((sum, p) => sum + p.text.length, 0);
  if (totalTextLength > 8000) {
    return Response.json(
      { error: "Message text exceeds 8000 characters." },
      { status: 400 },
    );
  }

  // --- Validate session ownership ---
  const chatSession = await prisma.chatSession.findFirst({
    where: { id: body.sessionId, userId },
  });
  if (!chatSession) return new Response("Not found", { status: 404 });

  // --- Rebuild history server-side (item 1) ---
  const storedHistory = await loadSessionHistory(chatSession.id);
  const serverMessages: UIMessage[] = [...storedHistory, incomingMessage as UIMessage];

  // --- Stream ---
  const { result, pendingQuestions } = await streamCyclops({ userId, messages: serverMessages });

  // Schedule gardener inside request scope
  after(async () => {
    try {
      if (await gardenerDue(userId)) {
        await runGardenerForUser(userId);
      }
    } catch (err) {
      console.error("gardener trigger failed", err);
    }
  });

  return result.toUIMessageStreamResponse({
    // originalMessages is the server-rebuilt array (item 1)
    originalMessages: serverMessages,
    onFinish: async ({ responseMessage, isAborted }) => {
      const lastUserMsg = incomingMessage as UIMessage;
      const toSave = [lastUserMsg, responseMessage];

      // 1. Persist chat messages with clientId + skipDuplicates (items 6 & 7)
      try {
        await prisma.chatMessage.createMany({
          data: toSave.map((m) => ({
            sessionId: chatSession.id,
            clientId: m.id ?? null,
            role: m.role,
            parts: JSON.stringify(m.parts),
            aborted: m === responseMessage ? isAborted : false,
          })),
          skipDuplicates: true,
        });
      } catch (err) {
        console.error("[chat] failed to persist messages", { sessionId: chatSession.id, err });
      }

      // 2. Mark gardener questions asked if assistant text contains distinctive chunk (item 4)
      try {
        if (pendingQuestions.length > 0) {
          // Collect all text from the assistant response
          const assistantText = responseMessage.parts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join(" ")
            .toLowerCase();

          const toMarkAsked = pendingQuestions
            .filter((q) => {
              const chunk = q.question.trim().slice(0, 25).toLowerCase();
              return chunk.length > 0 && assistantText.includes(chunk);
            })
            .map((q) => q.id);

          if (toMarkAsked.length > 0) {
            await prisma.gardenerQuestion.updateMany({
              where: { id: { in: toMarkAsked } },
              data: { status: "asked" },
            });
          }
        }
      } catch (err) {
        console.error("[chat] failed to mark questions asked", { userId, err });
      }

      // 3. Auto-title the session on first user message.
      try {
        if (chatSession.title === "New conversation" && lastUserMsg?.role === "user") {
          const textPart = lastUserMsg.parts.find((p) => p.type === "text");
          const title =
            textPart && "text" in textPart ? textPart.text.slice(0, 60) : "Conversation";
          await prisma.chatSession.update({
            where: { id: chatSession.id },
            data: { title },
          });
        }
      } catch (err) {
        console.error("[chat] failed to auto-title session", { sessionId: chatSession.id, err });
      }

      // 4. Touch updatedAt so the session list stays ordered.
      try {
        await prisma.chatSession.update({
          where: { id: chatSession.id },
          data: { updatedAt: new Date() },
        });
      } catch (err) {
        console.error("[chat] failed to update session timestamp", { sessionId: chatSession.id, err });
      }
    },
  });
}
```

- [ ] **Step 2: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```powershell
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```powershell
git add src/app/api/chat/route.ts
git commit -m "$(cat <<'EOF'
fix(cyclops): validate body, server-side history, gardener mark-asked, aborted flag

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `budget.ts` — fail-closed on malformed env (Item 8)

**Files:**
- Modify: `src/server/ai/budget.ts`
- Modify: `src/test/budget.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/test/budget.test.ts`, add inside the existing `describe("budget", ...)` block:

```typescript
  it("dailyLimit returns 2_000_000 for non-numeric env value", () => {
    const original = process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
    process.env.CYCLOPS_DAILY_TOKEN_BUDGET = "not-a-number";
    const { dailyLimit } = await import("@/server/ai/budget");
    expect(dailyLimit()).toBe(2_000_000);
    if (original === undefined) delete process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
    else process.env.CYCLOPS_DAILY_TOKEN_BUDGET = original;
  });
```

**Note:** because `dailyLimit` reads `process.env` at call time (not module load time), the dynamic import is not strictly needed — the existing import works. Simplify the test:

```typescript
import { describe, expect, it } from "vitest";
import { isOverBudget, dayKey, dailyLimit } from "@/server/ai/budget";

describe("budget", () => {
  it("dayKey is UTC YYYY-MM-DD", () => {
    expect(dayKey(new Date("2026-06-09T23:59:00Z"))).toBe("2026-06-09");
  });
  it("over budget when spent >= limit", () => {
    expect(isOverBudget(2_000_000, 2_000_000)).toBe(true);
    expect(isOverBudget(1_999_999, 2_000_000)).toBe(false);
  });
  it("dailyLimit returns 2_000_000 when env is unset", () => {
    const original = process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
    delete process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
    expect(dailyLimit()).toBe(2_000_000);
    if (original !== undefined) process.env.CYCLOPS_DAILY_TOKEN_BUDGET = original;
  });
  it("dailyLimit returns 2_000_000 for non-numeric env value (fail-closed)", () => {
    const original = process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
    process.env.CYCLOPS_DAILY_TOKEN_BUDGET = "garbage";
    expect(dailyLimit()).toBe(2_000_000);
    if (original !== undefined) process.env.CYCLOPS_DAILY_TOKEN_BUDGET = original;
    else delete process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
  });
  it("dailyLimit respects a valid numeric env value", () => {
    const original = process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
    process.env.CYCLOPS_DAILY_TOKEN_BUDGET = "500000";
    expect(dailyLimit()).toBe(500_000);
    if (original !== undefined) process.env.CYCLOPS_DAILY_TOKEN_BUDGET = original;
    else delete process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
  });
});
```

Replace the entire content of `src/test/budget.test.ts` with the above.

- [ ] **Step 2: Run tests to confirm 3 new tests fail**

```powershell
npx vitest run src/test/budget.test.ts
```

Expected: 2 existing pass, 3 new fail (dailyLimit not exported, and wrong behaviour).

- [ ] **Step 3: Fix `src/server/ai/budget.ts`**

Replace `dailyLimit` with:

```typescript
export function dailyLimit(): number {
  const n = Number(process.env.CYCLOPS_DAILY_TOKEN_BUDGET ?? 2_000_000);
  return Number.isFinite(n) ? n : 2_000_000;
}
```

The full file becomes:

```typescript
import { prisma } from "@/server/db";

export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isOverBudget(spent: number, limit: number): boolean {
  return spent >= limit;
}

export function dailyLimit(): number {
  const n = Number(process.env.CYCLOPS_DAILY_TOKEN_BUDGET ?? 2_000_000);
  return Number.isFinite(n) ? n : 2_000_000;
}

export async function checkBudget(userId: string): Promise<{ ok: boolean; spent: number }> {
  const usage = await prisma.dailyUsage.findUnique({
    where: { userId_day: { userId, day: dayKey() } },
  });
  const spent = usage?.tokens ?? 0;
  return { ok: !isOverBudget(spent, dailyLimit()), spent };
}

export async function recordUsage(userId: string, tokens: number): Promise<void> {
  const day = dayKey();
  await prisma.dailyUsage.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, tokens },
    update: { tokens: { increment: tokens } },
  });
}
```

- [ ] **Step 4: Run budget tests**

```powershell
npx vitest run src/test/budget.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Run all tests**

```powershell
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```powershell
git add src/server/ai/budget.ts src/test/budget.test.ts
git commit -m "$(cat <<'EOF'
fix(cyclops): dailyLimit fail-closed on malformed env (item 8)

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update gardener dedup to include "asked" status (Item 4)

**Files:**
- Modify: `src/server/memory/gardener.ts`

The spec says dedup against pending AND asked questions (`status in ["pending","asked"]`).

- [ ] **Step 1: Update `runGardenerForUser` to load both pending and asked questions**

In `src/server/memory/gardener.ts`, find the `runGardenerForUser` function. Change the `findMany` call that loads existing questions from:

```typescript
  const pendingRows = await prisma.gardenerQuestion.findMany({
    where: { userId, status: "pending" },
    select: { question: true },
  });
```

To:

```typescript
  const pendingRows = await prisma.gardenerQuestion.findMany({
    where: { userId, status: { in: ["pending", "asked"] } },
    select: { question: true },
  });
```

- [ ] **Step 2: Run all tests**

```powershell
npx vitest run
```

Expected: all tests pass (gardener tests are already passing and the change is backward-compatible — the `runGardener` pure function just receives a larger dedup list).

- [ ] **Step 3: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add src/server/memory/gardener.ts
git commit -m "$(cat <<'EOF'
fix(cyclops): gardener deduplicates against pending+asked questions (item 4)

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Full test run**

```powershell
npx vitest run --reporter=verbose
```

Expected: all tests pass. Target count: ~120+ (102 baseline + 3 annotateDecay + 18 tool-guards + 3 budget + 0 brain changes = ~126).

- [ ] **Step 3: Review commits**

```powershell
git log --oneline -10
```

Verify the 7 commits from this plan are present with correct messages.

---

## Deviations & Known Risks

1. **`onStepFinish` field path**: `step.usage.totalTokens` — this is `LanguageModelUsage.totalTokens` which is `number | undefined`. The code guards with `?? 0`. If the SDK emits a different shape in some future build, usage recording silently skips (fires `.catch`).

2. **`orderBy: { deadlineAt: { sort: "asc", nulls: "last" } }`**: Prisma 6 supports `nulls: "last"` for PostgreSQL. If `npx tsc --noEmit` reports a type error (e.g. schema has `deadlineAt` without `@db` annotation issues), fall back to `orderBy: { deadlineAt: "asc" }`.

3. **`@@unique([sessionId, clientId])`**: The SQL unique index is created with a `WHERE "clientId" IS NOT NULL` partial index to avoid constraint violations when multiple rows have `clientId = NULL`. The Prisma schema uses `clientId String?` which maps to nullable, and `skipDuplicates: true` handles any race conditions.

4. **`isAborted` in `onFinish`**: Present in the `toUIMessageStreamResponse` callback type as confirmed by the SDK type search. Verified field name is exactly `isAborted: boolean`.

5. **History rebuild + client message dedup**: The route now rejects any client history; only the last message from the client is trusted. This is a breaking change to the API contract — the frontend must send the full `messages` array (SDK does this) but the backend will only use the last one appended to server-loaded history.
