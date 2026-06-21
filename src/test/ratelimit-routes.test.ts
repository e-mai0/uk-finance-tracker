/**
 * Integration tests proving the rate-limiter is actually WIRED into the routes:
 * after auth, before expensive work, returning a 429 with Retry-After on exceed,
 * and isolating per-identity.
 *
 * We run the REAL limiter against a fake ioredis (stubbed REDIS_URL + ioredis
 * module) so the auth→limiter→429 path is exercised end-to-end. Heavy deps
 * (AI/DB) are mocked so a NON-limited request can return without real I/O —
 * that proves the limiter does not change normal success behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// --- shared mock fns (hoisted so vi.mock factories can close over them) ---
const { requireTokenMock, fieldMapMock, redisCtor, redisState } = vi.hoisted(() => {
  const redisState = {
    counters: new Map<string, number>(),
    ttls: new Map<string, number>(),
  };
  const client = {
    incr: vi.fn(async (k: string) => {
      const n = (redisState.counters.get(k) ?? 0) + 1;
      redisState.counters.set(k, n);
      return n;
    }),
    expire: vi.fn(async (k: string, s: number) => {
      redisState.ttls.set(k, s);
      return 1;
    }),
    ttl: vi.fn(async (k: string) => (redisState.ttls.has(k) ? redisState.ttls.get(k)! : -2)),
    duplicate: vi.fn(() => client),
  };
  return {
    requireTokenMock: vi.fn(),
    fieldMapMock: vi.fn(),
    redisCtor: vi.fn(() => client),
    redisState,
  };
});

vi.mock("ioredis", () => ({ default: redisCtor }));
vi.mock("@/server/ext-auth", () => ({ requireToken: requireTokenMock }));
// Heavy collaborators of the profile route — keep a non-limited request cheap.
vi.mock("@/server/ext-profile", () => ({ buildFieldMap: fieldMapMock }));

// The ext routes import ext-http (server-only) and the limiter; both are real.
import { EXT_LIMIT } from "@/server/ratelimit";
import { GET as profileGET } from "@/app/api/ext/profile/route";

function makeReq(token: string): Request {
  return new Request("http://localhost/api/ext/profile", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  redisState.counters.clear();
  redisState.ttls.clear();
  requireTokenMock.mockReset();
  fieldMapMock.mockReset();
  fieldMapMock.mockResolvedValue({ fields: {} });
});

describe("ext route rate-limit wiring (profile)", () => {
  it("allows requests under the limit and returns the normal 200 payload", async () => {
    requireTokenMock.mockResolvedValue({ userId: "userA" });
    const res = await profileGET(makeReq("trk_a"));
    expect(res.status).toBe(200);
    expect(fieldMapMock).toHaveBeenCalledWith("userA");
  });

  it("returns 429 with Retry-After once the per-token budget is exceeded", async () => {
    requireTokenMock.mockResolvedValue({ userId: "userA" });

    // Burn the whole window.
    for (let i = 0; i < EXT_LIMIT; i++) {
      const ok = await profileGET(makeReq("trk_a"));
      expect(ok.status).toBe(200);
    }

    const blocked = await profileGET(makeReq("trk_a"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    // CORS header is present so the extension can read the 429.
    expect(blocked.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await blocked.json();
    expect(body.error).toBeTruthy();
  });

  it("does the expensive work only when allowed (limiter runs BEFORE buildFieldMap)", async () => {
    requireTokenMock.mockResolvedValue({ userId: "userA" });
    for (let i = 0; i < EXT_LIMIT; i++) await profileGET(makeReq("trk_a"));
    fieldMapMock.mockClear();

    const blocked = await profileGET(makeReq("trk_a"));
    expect(blocked.status).toBe(429);
    // The work past the limiter must NOT have run.
    expect(fieldMapMock).not.toHaveBeenCalled();
  });

  it("isolates per-token: exhausting userA does NOT block userB", async () => {
    // Exhaust A
    requireTokenMock.mockResolvedValue({ userId: "userA" });
    for (let i = 0; i < EXT_LIMIT; i++) await profileGET(makeReq("trk_a"));
    const aBlocked = await profileGET(makeReq("trk_a"));
    expect(aBlocked.status).toBe(429);

    // B is fresh
    requireTokenMock.mockResolvedValue({ userId: "userB" });
    const bOk = await profileGET(makeReq("trk_b"));
    expect(bOk.status).toBe(200);
  });

  it("still 401s an invalid token without consuming any quota", async () => {
    requireTokenMock.mockResolvedValue(null);
    const res = await profileGET(makeReq("trk_bad"));
    expect(res.status).toBe(401);
    expect(redisState.counters.size).toBe(0);
  });
});
