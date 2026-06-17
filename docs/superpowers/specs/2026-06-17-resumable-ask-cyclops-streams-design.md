# Resumable Ask Cyclops streams — design

**Date:** 2026-06-17
**Status:** Approved (design)
**Branch:** `feat/resumable-chat-streams`

## Problem

When a user has an Ask Cyclops answer streaming and then opens a second session,
the previous answer **visibly collapses mid-stream**. Reported as: "cyclops bug —
when you ask two sessions at the time the prev one crashes."

### Confirmed root cause

The crash is **live-view-only** — the answer is still completed and persisted
server-side, and reloading the conversation shows the full text. The collapse is
caused entirely on the client:

- `CyclopsChat` aborts its in-flight stream on unmount via `stop()`
  (`src/app/(app)/chat/cyclops-chat.tsx:345-349`).
- Opening a second session unmounts the first chat: navigating to `/chat` hides
  the dock (`src/components/dock/cyclops-dock.tsx:130` → `return null`), switching
  threads re-keys the chat, and "Open in Ask Cyclops →" navigates away.
- `@ai-sdk/react@3.0.201` keeps each `Chat` instance per-component
  (`useRef(new Chat(...))`, `index.mjs:184-189`) with **no global store and
  `resume` defaulting to `false`** — so a torn-down stream can never reattach.
  Recovery today is only via server persistence reloaded as `initialMessages`.

The server path holds no shared mutable state (`src/server/ai/brain.ts`
`streamCyclops` builds everything per-call; `src/app/api/chat/route.ts` persists
keyed by `(sessionId, clientId)` with `skipDuplicates`), so concurrent sessions
never corrupt each other. This is purely a missing live-resume capability.

## Goal

Make a streaming answer **survive an unmount and reattach** when the session is
viewed again, so opening another session never makes the previous answer vanish.

## Approach (approved)

Adopt AI SDK v6 **resumable streams** backed by **Upstash Redis** (the documented
path), with the `resumable-stream` package buffering the live stream so any later
mount of the same session can reattach.

Confirmed AI SDK wiring (from installed `node_modules/ai/dist/index.js:13024-13061`):
- `useChat({ resume: true })` → on mount issues a **GET** to
  `${api}/${chatId}/stream`, i.e. `/api/chat/{sessionId}/stream` (our `useChat`
  `id` is the `sessionId`).
- A **204** response means "no active stream" → returns null, no error, falls back
  to the loaded messages.
- A 200 SSE response reattaches and continues rendering.

## Architecture & data flow

1. **POST `/api/chat`** (edit existing `route.ts`):
   - Mint a `streamId`.
   - Record the session's active-stream pointer in Redis:
     `resumable:chat:{sessionId}` → `streamId`, TTL ≈ `maxDuration` (120s) + buffer.
   - Wrap the UI-message SSE stream with
     `streamContext.resumableStream(streamId, () => sseStream)` and return it.
   - Keep `result.consumeStream()` so generation always completes server-side.
   - `onFinish` still persists the full message to Postgres **and clears the
     pointer** (`clearActiveStream(sessionId)`).

2. **GET `/api/chat/[sessionId]/stream`** (new route):
   - Auth + ownership check mirroring POST (`route.ts:49-101`):
     401 if unauthenticated, 404 if the session isn't the user's `cyclops` session.
   - Read the pointer; if absent/expired → **204**.
   - Else resume the buffered stream via the stream context and return it (200).

3. **Client** (`src/app/(app)/chat/cyclops-chat.tsx`):
   - Add `resume: true` to `useChat`.
   - **Remove the unmount `stop()` effect (lines 343-349)** — now unnecessary and
     harmful; resume reattaches on remount and the server already completes +
     persists. The manual Stop button (`handleStop`) is unchanged.

## Components (isolated, testable)

- **`src/server/ai/resumable.ts`** (new):
  - `getStreamContext()` — lazily creates a singleton
    `createResumableStreamContext({ waitUntil: after })` over a Redis client.
    **If `REDIS_URL` is unset, returns `null`.**
  - `setActiveStream(sessionId, streamId)`, `getActiveStream(sessionId)`,
    `clearActiveStream(sessionId)` — Redis pointer helpers; all no-op / return null
    when Redis is unconfigured.
- **`src/app/api/chat/[sessionId]/stream/route.ts`** (new) — GET resume handler.
- Edits to **`src/app/api/chat/route.ts`** and
  **`src/app/(app)/chat/cyclops-chat.tsx`**.

## Decisions

- **Pointer in Redis, not a DB column** — avoids a Prisma migration (schema changes
  must be applied manually by the user; this avoids one).
- **Graceful fallback when `REDIS_URL` is unset** — POST streams exactly as today
  (no resumable wrapping) and GET returns 204. Local dev and any environment
  without Redis keep working; the feature simply activates once Redis is wired.
- **Stop button and `consumeStream` unchanged** — keeps scope tight; Stop behaves
  as today (stops the client view; the server completes generation).
- **CV-builder chat (`/api/cv/chat`) is out of scope.** It shares the identical
  pattern and can adopt this later.

## Error handling & edge cases

- GET resume: 401 unauth · 404 not-owned · 204 no/expired stream · 200 active.
- Pointer TTL auto-expires orphaned streams; `onFinish` clears on normal
  completion so a returning user gets 204 → SSR `initialMessages` (already the full
  answer).
- Two tabs on one session → last-writer-wins pointer; acceptable.
- Redis unreachable at request time → treat as "no resumable" (fall back), never
  fail the user's chat.

## Testing

- **Unit:** pointer helpers in `resumable.ts` against a mocked Redis client
  (set/get/clear, and the `REDIS_URL`-unset no-op path). GET route handler:
  401 / 404 / 204 / 200 with a mocked stream context, including the no-Redis
  fallback returning 204.
- **Regression:** existing `route.ts` chat / apply-record tests stay green.
- **Manual acceptance (in-app):** reproduce the original bug — start an answer
  streaming in the dock, open the full Ask Cyclops page (and switch threads), and
  confirm the previous answer keeps streaming / reattaches instead of vanishing.
  (Live SSE resume is not unit-testable.)

## New infrastructure / dependencies (user-owned)

- Add deps: `resumable-stream` and a Redis client (`ioredis`).
- Provision **Upstash Redis** via the Vercel Marketplace and set `REDIS_URL` in
  production and local `.env`. **This is the user's to do** (no prod/secret access
  from the agent). The graceful fallback means all code lands and tests pass before
  Redis is provisioned; the feature activates when `REDIS_URL` is present.

## Out of scope

- CV-builder chat resume.
- Changing Stop-button semantics or server-side abort wiring.
- Any Prisma schema change.
