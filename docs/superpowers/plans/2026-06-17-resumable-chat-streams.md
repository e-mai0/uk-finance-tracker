# Resumable Ask Cyclops Streams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a streaming Ask Cyclops answer survive an unmount and reattach when the session is viewed again, so opening a second session never makes the previous answer vanish mid-stream.

**Architecture:** Buffer the live UI-message SSE stream to Upstash Redis via the `resumable-stream` package. POST `/api/chat` records a per-session active-stream pointer in Redis and returns a resumable stream; a new GET `/api/chat/[sessionId]/stream` route lets `useChat({ resume: true })` reattach. When `REDIS_URL` is unset everything falls back to today's non-resumable behavior.

**Tech Stack:** Next.js 15 App Router, AI SDK v6 (`ai@^6.0.199`, `@ai-sdk/react@3.0.201`), `resumable-stream`, `ioredis`, Prisma/Supabase Postgres, Vitest (node env, tests in `src/test/`).

## Global Constraints

- Read the relevant AI SDK / Next docs before writing streaming glue — this repo's `AGENTS.md` warns the framework versions differ from training data; verify every library signature against `node_modules/**/dist/*.d.ts`.
- No Prisma schema change — the active-stream pointer lives in Redis only.
- Graceful fallback: when `process.env.REDIS_URL` is unset/empty, POST streams exactly as today and GET returns HTTP 204. Never fail a user's chat because Redis is missing or unreachable.
- Do not change the Stop button (`handleStop`) or `result.consumeStream()` semantics.
- CV-builder chat (`/api/cv/chat`) is out of scope.
- Tests live in `src/test/<name>.test.ts`, run with `npm test` (`vitest run`), node environment, `@/` aliases `./src`.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Branch: `feat/resumable-chat-streams`. Never merge to main.

---

### Task 1: Redis stream store + resumable context (`resumable.ts`)

**Files:**
- Create: `src/server/ai/resumable.ts`
- Test: `src/test/resumable.test.ts`
- Modify: `package.json` (add deps)

**Interfaces:**
- Consumes: `after` from `next/server`; `createResumableStreamContext` from `resumable-stream`; `ioredis`.
- Produces:
  - `activeStreamKey(sessionId: string): string` — pure; returns `resumable:chat:${sessionId}`.
  - `getStreamContext(): ResumableStreamContext | null` — singleton; `null` when `REDIS_URL` unset.
  - `setActiveStream(sessionId: string, streamId: string): Promise<void>`
  - `getActiveStream(sessionId: string): Promise<string | null>`
  - `clearActiveStream(sessionId: string): Promise<void>`
  - `POINTER_TTL_SECONDS: number` (= 180)

- [ ] **Step 1: Install dependencies**

```bash
npm install resumable-stream ioredis
```

Then confirm the installed `resumable-stream` API before coding:

```bash
node -e "console.log(Object.keys(require('resumable-stream')))"
```
Expected: includes `createResumableStreamContext`. Open `node_modules/resumable-stream/dist/index.d.ts` and confirm the context exposes `resumableStream(streamId, makeStream)` and `resumeExistingStream(streamId)` returning `Promise<ReadableStream<string> | null>`. If names differ in the installed version, use the installed names consistently in Tasks 2-3.

- [ ] **Step 2: Write the failing test**

```ts
// src/test/resumable.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("resumable stream store", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("activeStreamKey namespaces by session id", async () => {
    const { activeStreamKey } = await import("@/server/ai/resumable");
    expect(activeStreamKey("sess-1")).toBe("resumable:chat:sess-1");
  });

  it("returns null context and no-ops the pointers when REDIS_URL is unset", async () => {
    vi.stubEnv("REDIS_URL", "");
    vi.resetModules();
    const mod = await import("@/server/ai/resumable");
    expect(mod.getStreamContext()).toBeNull();
    await expect(mod.setActiveStream("s", "id")).resolves.toBeUndefined();
    await expect(mod.getActiveStream("s")).resolves.toBeNull();
    await expect(mod.clearActiveStream("s")).resolves.toBeUndefined();
  });

  it("set/get/clear drive the Redis client when REDIS_URL is set", async () => {
    const store = new Map<string, string>();
    const fake = {
      set: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      del: vi.fn(async (k: string) => { store.delete(k); }),
      duplicate: vi.fn(() => fake),
    };
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.doMock("ioredis", () => ({ default: vi.fn(() => fake) }));
    vi.doMock("resumable-stream", () => ({ createResumableStreamContext: vi.fn(() => ({})) }));
    vi.resetModules();
    const mod = await import("@/server/ai/resumable");

    await mod.setActiveStream("sess-1", "stream-9");
    expect(fake.set).toHaveBeenCalledWith("resumable:chat:sess-1", "stream-9", "EX", mod.POINTER_TTL_SECONDS);
    await expect(mod.getActiveStream("sess-1")).resolves.toBe("stream-9");
    await mod.clearActiveStream("sess-1");
    await expect(mod.getActiveStream("sess-1")).resolves.toBeNull();
    vi.doUnmock("ioredis");
    vi.doUnmock("resumable-stream");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/resumable.test.ts`
Expected: FAIL — `Cannot find module '@/server/ai/resumable'`.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/server/ai/resumable.ts
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream";
import Redis from "ioredis";

/** Pointer TTL: route maxDuration (120s) plus a safety buffer. */
export const POINTER_TTL_SECONDS = 180;

const ACTIVE_PREFIX = "resumable:chat:";

/** Redis key holding the active streamId for a chat session. */
export function activeStreamKey(sessionId: string): string {
  return `${ACTIVE_PREFIX}${sessionId}`;
}

let redis: Redis | null | undefined;
let context: ResumableStreamContext | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  redis = url ? new Redis(url) : null;
  return redis;
}

/**
 * Resumable-stream context, or null when REDIS_URL is unset. The context needs
 * separate publish/subscribe connections, so we duplicate the base client.
 */
export function getStreamContext(): ResumableStreamContext | null {
  if (context !== undefined) return context;
  const client = getRedis();
  if (!client) {
    context = null;
    return null;
  }
  context = createResumableStreamContext({
    waitUntil: after,
    publisher: client,
    subscriber: client.duplicate(),
  });
  return context;
}

export async function setActiveStream(sessionId: string, streamId: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  await client.set(activeStreamKey(sessionId), streamId, "EX", POINTER_TTL_SECONDS);
}

export async function getActiveStream(sessionId: string): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;
  return client.get(activeStreamKey(sessionId));
}

export async function clearActiveStream(sessionId: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  await client.del(activeStreamKey(sessionId));
}
```

If Step 1 revealed `createResumableStreamContext` takes a different connection option shape (e.g. a single `redis` or a `keyPrefix`), adapt the `getStreamContext` body to the installed signature; the exported function names above must stay identical.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/resumable.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/server/ai/resumable.ts src/test/resumable.test.ts
git commit -m "feat(chat): add Redis-backed resumable stream store with no-Redis fallback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: GET resume route `/api/chat/[sessionId]/stream`

**Files:**
- Create: `src/app/api/chat/[sessionId]/stream/route.ts`
- Create: `src/server/chat/resume-decision.ts`
- Test: `src/test/resume-decision.test.ts`

**Interfaces:**
- Consumes: `getActiveStream`, `getStreamContext` from `@/server/ai/resumable` (Task 1); `auth` from `@/server/auth`; `prisma` from `@/server/db`.
- Produces: `resolveResumeDecision(args: { userId?: string; session: { id: string } | null; activeStreamId: string | null }): ResumeDecision` where `ResumeDecision = { status: 401 } | { status: 404 } | { status: 204 } | { status: 200; streamId: string }`.

- [ ] **Step 1: Write the failing test for the pure decision helper**

```ts
// src/test/resume-decision.test.ts
import { describe, it, expect } from "vitest";
import { resolveResumeDecision } from "@/server/chat/resume-decision";

describe("resolveResumeDecision", () => {
  const session = { id: "sess-1" };

  it("401 when unauthenticated", () => {
    expect(resolveResumeDecision({ userId: undefined, session, activeStreamId: "x" }))
      .toEqual({ status: 401 });
  });

  it("404 when the session is not found / not owned", () => {
    expect(resolveResumeDecision({ userId: "u1", session: null, activeStreamId: "x" }))
      .toEqual({ status: 404 });
  });

  it("204 when there is no active stream pointer", () => {
    expect(resolveResumeDecision({ userId: "u1", session, activeStreamId: null }))
      .toEqual({ status: 204 });
  });

  it("200 with the streamId when an active stream exists", () => {
    expect(resolveResumeDecision({ userId: "u1", session, activeStreamId: "stream-9" }))
      .toEqual({ status: 200, streamId: "stream-9" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/resume-decision.test.ts`
Expected: FAIL — `Cannot find module '@/server/chat/resume-decision'`.

- [ ] **Step 3: Write the pure decision helper**

```ts
// src/server/chat/resume-decision.ts
export type ResumeDecision =
  | { status: 401 }
  | { status: 404 }
  | { status: 204 }
  | { status: 200; streamId: string };

/** Pure: maps auth + ownership + pointer state to an HTTP outcome. */
export function resolveResumeDecision(args: {
  userId?: string;
  session: { id: string } | null;
  activeStreamId: string | null;
}): ResumeDecision {
  if (!args.userId) return { status: 401 };
  if (!args.session) return { status: 404 };
  if (!args.activeStreamId) return { status: 204 };
  return { status: 200, streamId: args.activeStreamId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/resume-decision.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the route handler (wires auth/prisma/context to the helper)**

```ts
// src/app/api/chat/[sessionId]/stream/route.ts
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getActiveStream, getStreamContext } from "@/server/ai/resumable";
import { resolveResumeDecision } from "@/server/chat/resume-decision";

export const maxDuration = 120;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  const chatSession = userId
    ? await prisma.chatSession.findFirst({
        where: { id: sessionId, userId, kind: "cyclops" },
        select: { id: true },
      })
    : null;

  const activeStreamId = userId ? await getActiveStream(sessionId) : null;

  const decision = resolveResumeDecision({ userId, session: chatSession, activeStreamId });
  if (decision.status !== 200) {
    return new Response(decision.status === 401 ? "Unauthorized" : null, { status: decision.status });
  }

  // Pointer says a stream is active; ask the context to resume it. If the
  // buffer is already gone (completed/expired between read and resume), 204 so
  // the client falls back to its loaded messages.
  const ctx = getStreamContext();
  const resumed = ctx ? await ctx.resumeExistingStream(decision.streamId) : null;
  if (!resumed) return new Response(null, { status: 204 });

  return new Response(resumed, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}
```

Before finishing this step, verify against the AI SDK resumable-streams doc and the `DefaultChatTransport` SSE parser (`node_modules/ai/dist/index.js` `processResponseStream`) that these response headers match what the client expects; if the AI SDK exposes a `UI_MESSAGE_STREAM_HEADERS` constant, prefer importing it over hand-writing headers.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests PASS (including the two new files); no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/chat/resume-decision.ts src/test/resume-decision.test.ts "src/app/api/chat/[sessionId]/stream/route.ts"
git commit -m "feat(chat): add GET resume route for in-flight Ask Cyclops streams

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Make POST `/api/chat` produce a resumable stream

**Files:**
- Modify: `src/app/api/chat/route.ts` (the streaming tail, currently lines 126-224)

**Interfaces:**
- Consumes: `getStreamContext`, `setActiveStream`, `clearActiveStream` from `@/server/ai/resumable` (Task 1); `generateId` from `ai`; `JsonToSseTransformStream`, `createUIMessageStreamResponse` from `ai`.
- Produces: no new exports; same Response contract to the client.

- [ ] **Step 1: Read the AI SDK streaming API before editing**

Confirm in `node_modules/ai/dist/index.d.ts`: `StreamTextResult.toUIMessageStream(options)` (line ~2494) accepts `{ originalMessages, onFinish }` via `UIMessageStreamOptions`; `JsonToSseTransformStream` (line ~4315) is `TransformStream<unknown, string>`; `createUIMessageStreamResponse({ stream, consumeSseStream })` (line ~4306) accepts a UI-message chunk stream. Confirm `generateId` is exported. These are the building blocks below.

- [ ] **Step 2: Replace the streaming tail with the resumable path**

In `src/app/api/chat/route.ts`, update the imports at the top:

```ts
import { after } from "next/server";
import { consumeStream, generateId, JsonToSseTransformStream } from "ai";
import {
  getStreamContext,
  setActiveStream,
  clearActiveStream,
} from "@/server/ai/resumable";
```

Replace the block from `result.consumeStream(); // no await` through the end of the `return result.toUIMessageStreamResponse({ ... })` call (current lines 140-224) with:

```ts
  // Run the LLM stream to completion server-side even if the client
  // disconnects, so onFinish still fires and the assistant message persists.
  result.consumeStream(); // no await

  const onFinish = async ({
    responseMessage,
    isAborted,
  }: {
    responseMessage: UIMessage;
    isAborted: boolean;
  }) => {
    const lastUserMsg = incomingMessage as UIMessage;
    const toSave = [lastUserMsg, responseMessage];

    // 1. Persist chat messages with clientId + skipDuplicates
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

    // 2. Mark gardener questions asked if the assistant echoed a distinctive chunk
    try {
      if (pendingQuestions.length > 0) {
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

    // 3. Auto-title the session on first user message
    try {
      if (chatSession.title === "New conversation" && lastUserMsg?.role === "user") {
        const textPart = lastUserMsg.parts.find((p) => p.type === "text");
        const title = textPart && "text" in textPart ? textPart.text.slice(0, 60) : "Conversation";
        await prisma.chatSession.update({ where: { id: chatSession.id }, data: { title } });
      }
    } catch (err) {
      console.error("[chat] failed to auto-title session", { sessionId: chatSession.id, err });
    }

    // 4. Touch updatedAt so the session list stays ordered
    try {
      await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });
    } catch (err) {
      console.error("[chat] failed to update session timestamp", { sessionId: chatSession.id, err });
    }

    // 5. Stream is done — drop the resume pointer so GET returns 204 hereafter.
    await clearActiveStream(chatSession.id);
  };

  const uiStream = result.toUIMessageStream({
    originalMessages: serverMessages,
    onFinish,
  });

  // Without Redis, behave exactly as before: stream straight to the client.
  const streamContext = getStreamContext();
  if (!streamContext) {
    return createUIMessageStreamResponse({ stream: uiStream, consumeSseStream: consumeStream });
  }

  // With Redis: register a resumable stream and record the session pointer so a
  // remount (e.g. opening another session and coming back) can reattach.
  const streamId = generateId();
  await setActiveStream(chatSession.id, streamId);
  const sseStream = uiStream.pipeThrough(new JsonToSseTransformStream());
  const resumable = await streamContext.resumableStream(streamId, () => sseStream);

  return new Response(resumable ?? sseStream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
```

Add `createUIMessageStreamResponse` to the `ai` import line. Keep all earlier parts of the handler (auth, budget, validation, ownership, user-message persistence, `streamCyclops`, `after(...)` gardener) unchanged. Note `onFinish` no longer needs `messages`/`isContinuation`; keep the `UIMessage` import.

Verify the header set and the `resumableStream`/`createUIMessageStreamResponse` signatures against the installed types (AGENTS.md); if the AI SDK exposes a shared headers constant, use it in both this route and Task 2's route.

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests PASS (the existing `application-record` / chat tests still green); no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(chat): serve Ask Cyclops answers as resumable streams (Redis), fall back without it

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Client reattaches on mount; stop killing the stream on unmount

**Files:**
- Modify: `src/app/(app)/chat/cyclops-chat.tsx:321-349`

**Interfaces:**
- Consumes: `useChat` from `@ai-sdk/react` (the `resume` option, confirmed in `node_modules/@ai-sdk/react/dist/index.mjs:140,221-225`).
- Produces: no new exports.

- [ ] **Step 1: Enable resume on the chat hook**

In `src/app/(app)/chat/cyclops-chat.tsx`, add `resume: true` to the `useChat(...)` options (alongside `id: sessionId`, `transport`, `messages`):

```ts
  const { messages, sendMessage, regenerate, stop, status, error } = useChat({
    id: sessionId,
    resume: true,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
      prepareSendMessagesRequest: ({ messages: msgs, body }) => ({
        body: { ...body, messages: msgs.slice(-1) },
      }),
    }),
    messages: initialMessages,
  });
```

On mount, `useChat` issues `GET /api/chat/{sessionId}/stream`; a 204 (no active stream) is a no-op, a 200 reattaches to the live stream.

- [ ] **Step 2: Remove the unmount abort**

Delete the unmount cleanup that aborts the in-flight stream (current lines 336-349 — the comment block, the `stopRef` ref, and the `useEffect(() => () => void stopRef.current(), [])`). It is the direct cause of the "previous session vanishes" bug, and resume now reattaches instead. Keep `handleStop`/`Composer`'s Stop button and the `stop` value from `useChat` unchanged. If `stop` is now otherwise unused beyond `handleStop`, leave the destructure as-is (still referenced by `handleStop`).

- [ ] **Step 3: Typecheck + lint the changed file**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/chat/cyclops-chat.tsx"`
Expected: no type errors; no new lint errors (no unused `stopRef`/`useRef`/`useEffect` left dangling — remove now-unused imports if Step 2 orphaned them).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/chat/cyclops-chat.tsx"
git commit -m "fix(chat): resume in-flight stream on mount; stop aborting it on unmount

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Manual acceptance + docs

**Files:**
- Modify: `.env.example` (document `REDIS_URL`)
- Modify: `docs/superpowers/specs/2026-06-17-resumable-ask-cyclops-streams-design.md` (mark Implemented)

- [ ] **Step 1: Document the env var**

Add to `.env.example` (create the line near other service URLs):

```
# Upstash Redis (Vercel Marketplace) — enables resumable Ask Cyclops streams.
# When unset, chat still works but streams are not resumable.
REDIS_URL=
```

- [ ] **Step 2: Manual acceptance (requires REDIS_URL set locally)**

With `REDIS_URL` pointed at an Upstash instance and `npm run dev` running, reproduce the original bug:
1. On `/today`, ask Cyclops in the dock; while it is streaming, click "Open in Ask Cyclops →" (navigates to `/chat`).
2. Expected: the answer continues / reattaches in the dock when you return to a dock page, instead of collapsing mid-stream.
3. On `/chat`, start an answer in thread A, switch to thread B, then back to A. Expected: A's answer is still streaming or fully present, never a truncated collapse.
4. With `REDIS_URL` unset, repeat — chat must still work (answers persist and reload), just without live reattachment.

Record the result (pass/fail per step) in the PR description.

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/superpowers/specs/2026-06-17-resumable-ask-cyclops-streams-design.md
git commit -m "docs(chat): document REDIS_URL and mark resumable streams implemented

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Redis stream store + `getStreamContext` fallback → Task 1. ✓
- POST records pointer + resumable wrapping + clears on finish → Task 3. ✓
- GET resume route with 401/404/204/200 → Task 2. ✓
- Client `resume: true` + remove unmount stop → Task 4. ✓
- No Prisma migration (Redis pointer) → Tasks 1/3 use Redis only. ✓
- Graceful no-`REDIS_URL` fallback → Task 1 (null context), Task 2 (204), Task 3 (plain stream branch). ✓
- Stop button / `consumeStream` unchanged → Tasks 3-4 preserve both. ✓
- CV-builder out of scope → not touched. ✓
- Testing (pointer helpers, decision helper, regression, manual) → Tasks 1, 2, 5. ✓
- `REDIS_URL` provisioning is user-owned → Task 5 docs the var; infra noted in spec.

**Placeholder scan:** No TBD/TODO; every code step shows full code. The library-signature "verify against installed types" steps are due-diligence checks mandated by AGENTS.md, not deferred work — the concrete code is present and the checks adjust only if the installed version diverges.

**Type consistency:** `activeStreamKey`, `getStreamContext`, `setActiveStream`/`getActiveStream`/`clearActiveStream`, `POINTER_TTL_SECONDS` (Task 1) are used with identical names in Tasks 2-3. `resolveResumeDecision`/`ResumeDecision` (Task 2) match between helper, test, and route. `resumableStream`/`resumeExistingStream` are used consistently in Tasks 2-3 and pinned to the installed package in Task 1 Step 1.
