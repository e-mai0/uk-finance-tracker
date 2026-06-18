// src/server/ai/resumable.ts
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream/ioredis";
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

function logRedisFailure(operation: string, err: unknown): void {
  console.error("[resumable] Redis operation failed", { operation, err });
}

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  try {
    redis = url ? new Redis(url) : null;
  } catch (err) {
    logRedisFailure("connect", err);
    redis = null;
  }
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
  try {
    context = createResumableStreamContext({
      waitUntil: after,
      publisher: client,
      subscriber: client.duplicate(),
    });
  } catch (err) {
    logRedisFailure("create-stream-context", err);
    context = null;
  }
  return context;
}

export async function setActiveStream(
  sessionId: string,
  streamId: string,
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    await client.set(activeStreamKey(sessionId), streamId, "EX", POINTER_TTL_SECONDS);
    return true;
  } catch (err) {
    logRedisFailure("set-active-stream", err);
    return false;
  }
}

export async function getActiveStream(
  sessionId: string,
): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    return await client.get(activeStreamKey(sessionId));
  } catch (err) {
    logRedisFailure("get-active-stream", err);
    return null;
  }
}

export async function clearActiveStream(sessionId: string): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    await client.del(activeStreamKey(sessionId));
    return true;
  } catch (err) {
    logRedisFailure("clear-active-stream", err);
    return false;
  }
}
