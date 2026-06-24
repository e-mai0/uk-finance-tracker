import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { authMock, checkBudgetMock, redisCtor, redisState } = vi.hoisted(() => {
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
    authMock: vi.fn(),
    checkBudgetMock: vi.fn(),
    redisCtor: vi.fn(() => client),
    redisState,
  };
});

vi.mock("ioredis", () => ({ default: redisCtor }));
vi.mock("@/server/auth", () => ({ auth: authMock }));
vi.mock("@/server/ai/budget", () => ({ checkBudget: checkBudgetMock }));
vi.mock("@/server/db", () => ({
  prisma: {
    chatMessage: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    chatSession: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/server/ai/cv-brain", () => ({
  streamCvBuilder: vi.fn(),
}));
vi.mock("@/server/cv/grounding", () => ({
  syncCvGrounding: vi.fn(),
}));

import { CHAT_LIMIT } from "@/server/ratelimit";
import { POST } from "@/app/api/cv/chat/route";

function makeReq(): Request {
  return new Request("http://localhost/api/cv/chat", {
    method: "POST",
    body: "{}",
  });
}

beforeEach(() => {
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  redisState.counters.clear();
  redisState.ttls.clear();
  authMock.mockReset();
  checkBudgetMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "userA" } });
  checkBudgetMock.mockResolvedValue({ ok: false });
});

describe("CV chat route rate-limit wiring", () => {
  it("returns a limiter 429 before the budget and AI path once the chat window is exhausted", async () => {
    for (let i = 0; i < CHAT_LIMIT; i++) {
      const res = await POST(makeReq());
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBeNull();
    }

    checkBudgetMock.mockClear();
    const blocked = await POST(makeReq());

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    expect(checkBudgetMock).not.toHaveBeenCalled();
  });
});
