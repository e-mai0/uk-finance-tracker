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
    vi.doMock("resumable-stream/ioredis", () => ({ createResumableStreamContext: vi.fn(() => ({})) }));
    vi.resetModules();
    const mod = await import("@/server/ai/resumable");

    await mod.setActiveStream("sess-1", "stream-9");
    expect(fake.set).toHaveBeenCalledWith("resumable:chat:sess-1", "stream-9", "EX", mod.POINTER_TTL_SECONDS);
    await expect(mod.getActiveStream("sess-1")).resolves.toBe("stream-9");
    await mod.clearActiveStream("sess-1");
    await expect(mod.getActiveStream("sess-1")).resolves.toBeNull();
    vi.doUnmock("ioredis");
    vi.doUnmock("resumable-stream/ioredis");
  });
});
