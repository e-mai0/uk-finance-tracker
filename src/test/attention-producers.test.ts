import { describe, it, expect, vi, beforeEach } from "vitest";

const { upsert, updateMany } = vi.hoisted(() => ({
  upsert: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock("@/server/db", () => ({ prisma: { attentionItem: { upsert, updateMany } } }));

import {
  upsertAttention,
  resolveAttentionByKey,
  resolveAttentionByTarget,
} from "@/server/attention";

beforeEach(() => {
  upsert.mockReset();
  updateMany.mockReset();
});

describe("upsertAttention", () => {
  it("upserts on the [userId,key] unique", async () => {
    upsert.mockResolvedValueOnce({});
    await upsertAttention({
      userId: "u1", kind: "BRIEF", key: "brief:2026-06-11",
      targetType: "chat-session", targetId: "s1", title: "Morning brief — 11 Jun",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_key: { userId: "u1", key: "brief:2026-06-11" } },
      }),
    );
  });

  it("swallows table-missing errors (pre-SQL gate)", async () => {
    upsert.mockRejectedValueOnce(new Error("relation does not exist"));
    await expect(
      upsertAttention({
        userId: "u1", kind: "QUESTION", key: "gq:1",
        targetType: "gardener-question", targetId: "1", title: "q",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("resolve helpers", () => {
  it("resolveAttentionByKey marks resolved with timestamp", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    await resolveAttentionByKey("u1", "brief:2026-06-11");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1", key: "brief:2026-06-11" }),
        data: expect.objectContaining({ status: "RESOLVED" }),
      }),
    );
  });

  it("resolveAttentionByTarget resolves all open items for a target", async () => {
    updateMany.mockResolvedValueOnce({ count: 2 });
    await resolveAttentionByTarget("u1", "chat-session", "s1");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ targetType: "chat-session", targetId: "s1" }),
      }),
    );
  });
});
