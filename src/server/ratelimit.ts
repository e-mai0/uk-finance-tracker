import "server-only";
import Redis from "ioredis";

/**
 * Abuse rate-limiting for the shared API budget.
 *
 * This is a fixed-window request-flood guard, COMPLEMENTARY to the per-user
 * daily token budget in `src/server/ai/budget.ts` (which is a COST cap, not an
 * abuse cap). For an invite-only beta with dozens of strangers, this stops a
 * single token/user from flooding the chat or extension endpoints.
 *
 * Design notes:
 * - FAIL-OPEN: if Redis is unconfigured or errors, the request is ALLOWED.
 *   Matches the app's existing graceful-degrade posture (see resumable.ts) —
 *   we never lock out legitimate users because of an infra hiccup. We log the
 *   degradation so it's visible in operations.
 * - The store is INJECTABLE via the {@link RateLimitStore} interface so the
 *   limiter is unit-testable without a live Redis.
 * - Fixed window keyed per identity + bucket label, so different surfaces
 *   (chat vs each ext route) have independent budgets.
 */

// ---------------------------------------------------------------------------
// Tunable limits (named constants — documented so they're easy to audit).
//
// These are deliberately generous: normal interactive use should never reach
// them. A human chatting can't realistically send 30 messages a minute, and a
// real autofill session fires a handful of ext calls, not 60+/min.
// ---------------------------------------------------------------------------

/** Chat (/api/chat): per authenticated user. */
export const CHAT_LIMIT = 30;
export const CHAT_WINDOW_SECONDS = 60;

/** Extension (/api/ext/*): per trk_ token's user. */
export const EXT_LIMIT = 60;
export const EXT_WINDOW_SECONDS = 60;

// ---------------------------------------------------------------------------
// Store abstraction
// ---------------------------------------------------------------------------

/** Result of bumping a window counter. */
export interface IncrResult {
  /** The counter value AFTER this increment (1 on the first hit of a window). */
  count: number;
  /** Seconds remaining until this window expires. */
  ttlSeconds: number;
}

/**
 * Minimal store contract the limiter needs. The production implementation is
 * Redis-backed; tests inject a deterministic in-memory fake.
 */
export interface RateLimitStore {
  /**
   * Atomically increment the counter for `key`, creating it with a TTL of
   * `windowSeconds` on first use. Returns the new count and the remaining TTL.
   */
  incr(key: string, windowSeconds: number): Promise<IncrResult>;
}

/** Structured limiter verdict returned to callers. */
export interface RateLimitResult {
  allowed: boolean;
  /** The configured limit for this window. */
  limit: number;
  /** Requests remaining in the current window (never negative). */
  remaining: number;
  /** Seconds until the window resets (the Retry-After hint). */
  resetSeconds: number;
}

// ---------------------------------------------------------------------------
// Redis-backed store (the default in production)
// ---------------------------------------------------------------------------

let redisClient: Redis | null | undefined;

function logDegradation(operation: string, err: unknown): void {
  console.error("[ratelimit] degraded (failing open)", { operation, err });
}

/**
 * Lazily construct the ioredis client from REDIS_URL. Mirrors the connection
 * pattern in `src/server/ai/resumable.ts`. Returns null when REDIS_URL is
 * unset or the client can't be constructed — callers then fail open.
 */
function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL;
  try {
    redisClient = url ? new Redis(url) : null;
  } catch (err) {
    logDegradation("connect", err);
    redisClient = null;
  }
  return redisClient;
}

/**
 * Production store backed by Redis INCR + EXPIRE. On the first hit of a window
 * we INCR to 1 then set the TTL; subsequent hits in the same window just INCR.
 * Reads the live TTL so `resetSeconds` is accurate. Throws on Redis errors so
 * the limiter's fail-open path engages.
 */
export function redisStore(client: Redis): RateLimitStore {
  return {
    async incr(key: string, windowSeconds: number): Promise<IncrResult> {
      const count = await client.incr(key);
      if (count === 1) {
        // First request in this window — arm the expiry.
        await client.expire(key, windowSeconds);
        return { count, ttlSeconds: windowSeconds };
      }
      let ttl = await client.ttl(key);
      // -1 (no expiry, shouldn't happen) / -2 (key gone): re-arm defensively so
      // a counter can never get stuck without a TTL and block a user forever.
      if (ttl < 0) {
        await client.expire(key, windowSeconds);
        ttl = windowSeconds;
      }
      return { count, ttlSeconds: ttl };
    },
  };
}

/** The default production store, or null when Redis is unavailable. */
export function defaultStore(): RateLimitStore | null {
  const client = getRedis();
  return client ? redisStore(client) : null;
}

// ---------------------------------------------------------------------------
// Core limiter
// ---------------------------------------------------------------------------

export interface RateLimitArgs {
  /** Fully-qualified key, e.g. `chat:<userId>` or `ext:agent:<userId>`. */
  key: string;
  limit: number;
  windowSeconds: number;
  /**
   * Store to use. Pass `undefined` to use the default Redis store; pass `null`
   * (or omit when Redis is down) to force the fail-open path. Tests inject a
   * fake here.
   */
  store?: RateLimitStore | null;
}

/**
 * Evaluate the limiter for one request. FAIL-OPEN: any missing store or thrown
 * error yields `allowed: true`.
 */
export async function rateLimit(args: RateLimitArgs): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = args;
  const store = args.store === undefined ? defaultStore() : args.store;

  // No store configured → fail open (Redis is optional in this app).
  if (!store) {
    return { allowed: true, limit, remaining: limit, resetSeconds: 0 };
  }

  try {
    const { count, ttlSeconds } = await store.incr(key, windowSeconds);
    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit;
    return { allowed, limit, remaining, resetSeconds: ttlSeconds };
  } catch (err) {
    logDegradation("incr", err);
    // Redis errored → fail open.
    return { allowed: true, limit, remaining: limit, resetSeconds: 0 };
  }
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

/**
 * Build a 429 Too Many Requests response from a (blocked) limiter result.
 * Includes a `Retry-After` header (seconds) and a small JSON body. Extra
 * headers (e.g. the ext CORS headers) are merged in.
 */
export function tooManyRequests(
  result: RateLimitResult,
  extraHeaders: Record<string, string> = {},
): Response {
  const retryAfter = Math.max(1, Math.ceil(result.resetSeconds));
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please slow down and try again shortly.",
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        "RateLimit-Limit": String(result.limit),
        "RateLimit-Remaining": String(result.remaining),
        ...extraHeaders,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Shared wrappers (so route handlers don't copy-paste the check)
// ---------------------------------------------------------------------------

/**
 * Enforce the chat limit for an authenticated user. Returns a 429 Response if
 * blocked, or null if the request may proceed.
 */
export async function enforceChatLimit(userId: string): Promise<Response | null> {
  const result = await rateLimit({
    key: `chat:${userId}`,
    limit: CHAT_LIMIT,
    windowSeconds: CHAT_WINDOW_SECONDS,
  });
  return result.allowed ? null : tooManyRequests(result);
}

/**
 * Enforce the per-route extension limit for a token's user. `bucket` is the
 * route label (e.g. "agent", "answer") so each ext surface has its own budget.
 * `extraHeaders` lets routes attach their CORS headers to the 429.
 */
export async function enforceExtLimit(
  bucket: string,
  userId: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const result = await rateLimit({
    key: `ext:${bucket}:${userId}`,
    limit: EXT_LIMIT,
    windowSeconds: EXT_WINDOW_SECONDS,
  });
  return result.allowed ? null : tooManyRequests(result, extraHeaders);
}
