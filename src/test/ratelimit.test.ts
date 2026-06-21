/**
 * Tests for the abuse rate-limiter (src/server/ratelimit.ts).
 *
 * Strategy: drive the limiter against an INJECTED fake store so no live Redis
 * is needed. The fake mirrors the real contract: incr(key, windowSeconds)
 * returns the new count and the seconds remaining in the window.
 *
 * Mutation / held-out targets the reviewer will check:
 *   (a) over-limit  → allowed=false (429 at the route layer)
 *   (b) under-limit → allowed=true
 *   (c) per-key ISOLATION — exhausting key A does not affect key B
 *   (d) store down / throws → FAIL-OPEN (allowed=true)
 *   (e) window reset → allowed again after the window rolls over
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  rateLimit,
  redisStore,
  tooManyRequests,
  CHAT_LIMIT,
  CHAT_WINDOW_SECONDS,
  EXT_LIMIT,
  EXT_WINDOW_SECONDS,
  type RateLimitStore,
} from "@/server/ratelimit";

/**
 * In-memory fixed-window store that mimics Redis INCR + per-window TTL.
 * Time is virtual (`now`) so window resets are deterministic.
 */
function makeFakeStore() {
  let now = 0;
  const windows = new Map<string, { count: number; expiresAt: number }>();
  const store: RateLimitStore = {
    async incr(key: string, windowSeconds: number) {
      const existing = windows.get(key);
      if (!existing || existing.expiresAt <= now) {
        const fresh = { count: 1, expiresAt: now + windowSeconds };
        windows.set(key, fresh);
        return { count: 1, ttlSeconds: windowSeconds };
      }
      existing.count += 1;
      return {
        count: existing.count,
        ttlSeconds: Math.max(1, existing.expiresAt - now),
      };
    },
  };
  return {
    store,
    advance: (seconds: number) => {
      now += seconds;
    },
  };
}

describe("rateLimit constants", () => {
  it("uses generous, finite limits (a never-triggering limiter is a bug)", () => {
    expect(CHAT_LIMIT).toBeGreaterThan(0);
    expect(CHAT_LIMIT).toBeLessThan(10_000);
    expect(CHAT_WINDOW_SECONDS).toBeGreaterThan(0);
    expect(EXT_LIMIT).toBeGreaterThan(0);
    expect(EXT_LIMIT).toBeLessThan(10_000);
    expect(EXT_WINDOW_SECONDS).toBeGreaterThan(0);
  });
});

describe("rateLimit under the cap", () => {
  it("allows the first request and reports remaining", async () => {
    const { store } = makeFakeStore();
    const res = await rateLimit({ key: "chat:u1", limit: 5, windowSeconds: 60, store });
    expect(res.allowed).toBe(true);
    expect(res.limit).toBe(5);
    expect(res.remaining).toBe(4);
    expect(res.resetSeconds).toBeGreaterThan(0);
  });

  it("allows every request up to and including the limit", async () => {
    const { store } = makeFakeStore();
    for (let i = 1; i <= 5; i++) {
      const res = await rateLimit({ key: "chat:u1", limit: 5, windowSeconds: 60, store });
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(5 - i);
    }
  });
});

describe("rateLimit over the cap", () => {
  it("blocks the request that exceeds the limit (the (limit+1)th)", async () => {
    const { store } = makeFakeStore();
    let last;
    for (let i = 0; i < 5; i++) {
      last = await rateLimit({ key: "chat:u1", limit: 5, windowSeconds: 60, store });
    }
    expect(last!.allowed).toBe(true); // 5th still allowed

    const sixth = await rateLimit({ key: "chat:u1", limit: 5, windowSeconds: 60, store });
    expect(sixth.allowed).toBe(false);
    expect(sixth.remaining).toBe(0);
    expect(sixth.resetSeconds).toBeGreaterThan(0);
  });

  it("does NOT block at exactly the limit (off-by-one guard)", async () => {
    const { store } = makeFakeStore();
    let res;
    for (let i = 0; i < 3; i++) {
      res = await rateLimit({ key: "chat:u1", limit: 3, windowSeconds: 60, store });
    }
    expect(res!.allowed).toBe(true);
  });
});

describe("rateLimit per-key isolation", () => {
  it("exhausting key A does not block key B", async () => {
    const { store } = makeFakeStore();
    // Exhaust A
    for (let i = 0; i < 3; i++) {
      await rateLimit({ key: "chat:userA", limit: 3, windowSeconds: 60, store });
    }
    const aBlocked = await rateLimit({ key: "chat:userA", limit: 3, windowSeconds: 60, store });
    expect(aBlocked.allowed).toBe(false);

    // B is untouched
    const bFirst = await rateLimit({ key: "chat:userB", limit: 3, windowSeconds: 60, store });
    expect(bFirst.allowed).toBe(true);
    expect(bFirst.remaining).toBe(2);
  });

  it("isolates different buckets for the same identity", async () => {
    const { store } = makeFakeStore();
    for (let i = 0; i < 3; i++) {
      await rateLimit({ key: "chat:u1", limit: 3, windowSeconds: 60, store });
    }
    const chatBlocked = await rateLimit({ key: "chat:u1", limit: 3, windowSeconds: 60, store });
    expect(chatBlocked.allowed).toBe(false);

    // A different bucket label for the same user is independent.
    const extFirst = await rateLimit({ key: "ext:agent:u1", limit: 3, windowSeconds: 60, store });
    expect(extFirst.allowed).toBe(true);
  });
});

describe("rateLimit fail-open", () => {
  it("ALLOWS when the store throws (Redis down must not lock out users)", async () => {
    const throwing: RateLimitStore = {
      async incr() {
        throw new Error("redis connection refused");
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await rateLimit({ key: "chat:u1", limit: 1, windowSeconds: 60, store: throwing });
    expect(res.allowed).toBe(true);
  });

  it("ALLOWS when no store is provided (Redis unconfigured)", async () => {
    const res = await rateLimit({ key: "chat:u1", limit: 1, windowSeconds: 60, store: null });
    expect(res.allowed).toBe(true);
  });

  it("does not block even if called many times while the store is down", async () => {
    const throwing: RateLimitStore = {
      async incr() {
        throw new Error("down");
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 50; i++) {
      const res = await rateLimit({ key: "chat:u1", limit: 1, windowSeconds: 60, store: throwing });
      expect(res.allowed).toBe(true);
    }
  });
});

describe("rateLimit window reset", () => {
  it("allows again after the window rolls over", async () => {
    const { store, advance } = makeFakeStore();
    // Exhaust within the window
    for (let i = 0; i < 2; i++) {
      await rateLimit({ key: "chat:u1", limit: 2, windowSeconds: 60, store });
    }
    const blocked = await rateLimit({ key: "chat:u1", limit: 2, windowSeconds: 60, store });
    expect(blocked.allowed).toBe(false);

    // Roll past the window boundary
    advance(61);
    const afterReset = await rateLimit({ key: "chat:u1", limit: 2, windowSeconds: 60, store });
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(1);
  });
});

describe("redisStore (production INCR + EXPIRE path)", () => {
  /** Minimal fake ioredis honoring INCR / EXPIRE / TTL semantics. */
  function makeFakeRedis() {
    const counters = new Map<string, number>();
    const ttls = new Map<string, number>();
    return {
      incr: vi.fn(async (k: string) => {
        const next = (counters.get(k) ?? 0) + 1;
        counters.set(k, next);
        return next;
      }),
      expire: vi.fn(async (k: string, s: number) => {
        ttls.set(k, s);
        return 1;
      }),
      ttl: vi.fn(async (k: string) => (ttls.has(k) ? ttls.get(k)! : -2)),
      counters,
      ttls,
    };
  }

  it("arms the TTL only on the first hit of a window", async () => {
    const fake = makeFakeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = redisStore(fake as any);

    const first = await store.incr("ext:agent:u1", 60);
    expect(first.count).toBe(1);
    expect(first.ttlSeconds).toBe(60);
    expect(fake.expire).toHaveBeenCalledTimes(1);
    expect(fake.expire).toHaveBeenCalledWith("ext:agent:u1", 60);

    const second = await store.incr("ext:agent:u1", 60);
    expect(second.count).toBe(2);
    // No re-arm on a live window.
    expect(fake.expire).toHaveBeenCalledTimes(1);
    expect(second.ttlSeconds).toBe(60);
  });

  it("re-arms a counter that somehow lost its TTL (-1/-2) so a user can't be stuck", async () => {
    const fake = makeFakeRedis();
    // Pre-seed a counter with no TTL recorded → ttl() returns -2.
    fake.counters.set("chat:u1", 5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = redisStore(fake as any);

    const res = await store.incr("chat:u1", 30);
    expect(res.count).toBe(6);
    expect(res.ttlSeconds).toBe(30);
    expect(fake.expire).toHaveBeenCalledWith("chat:u1", 30);
  });

  it("over-limit detection works end-to-end through redisStore + rateLimit", async () => {
    const fake = makeFakeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = redisStore(fake as any);
    let res;
    for (let i = 0; i < 3; i++) {
      res = await rateLimit({ key: "chat:u1", limit: 3, windowSeconds: 60, store });
      expect(res.allowed).toBe(true);
    }
    res = await rateLimit({ key: "chat:u1", limit: 3, windowSeconds: 60, store });
    expect(res.allowed).toBe(false);
  });

  it("propagates Redis errors so rateLimit fails open", async () => {
    const broken = {
      incr: vi.fn(async () => {
        throw new Error("READONLY");
      }),
      expire: vi.fn(),
      ttl: vi.fn(),
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = redisStore(broken as any);
    const res = await rateLimit({ key: "chat:u1", limit: 1, windowSeconds: 60, store });
    expect(res.allowed).toBe(true);
  });
});

describe("tooManyRequests response", () => {
  it("returns HTTP 429 with a Retry-After header and JSON body", async () => {
    const res = tooManyRequests({
      allowed: false,
      limit: 30,
      remaining: 0,
      resetSeconds: 42,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("Retry-After is at least 1 second even if resetSeconds is 0", async () => {
    const res = tooManyRequests({ allowed: false, limit: 30, remaining: 0, resetSeconds: 0 });
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });

  it("merges extra headers (e.g. CORS) into the 429 response", () => {
    const res = tooManyRequests(
      { allowed: false, limit: 30, remaining: 0, resetSeconds: 5 },
      { "Access-Control-Allow-Origin": "*" },
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
