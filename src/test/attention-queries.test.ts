import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: { attentionItem: { findMany } } }));

import { getBadgeCounts, getOpenAttentionByTarget } from "@/server/queries/attention";

beforeEach(() => findMany.mockReset());

describe("getBadgeCounts", () => {
  it("counts all open as today, application-targets as applications, distinct chat sessions as chat", async () => {
    findMany.mockResolvedValue([
      { targetType: "chat-session", targetId: "s1" },
      { targetType: "chat-session", targetId: "s1" },
      { targetType: "draft", targetId: "d1" },
      { targetType: "application", targetId: "a1" },
      { targetType: "opportunity", targetId: "o1" },
    ]);
    const counts = await getBadgeCounts("u1");
    expect(counts).toEqual({ today: 5, applications: 2, chat: 1 });
  });

  it("returns zeros when the table does not exist yet (pre-SQL gate)", async () => {
    findMany.mockRejectedValueOnce(new Error("relation AttentionItem does not exist"));
    const counts = await getBadgeCounts("u1");
    expect(counts).toEqual({ today: 0, applications: 0, chat: 0 });
  });
});

describe("getOpenAttentionByTarget", () => {
  it("groups open items by opportunity target id", async () => {
    findMany.mockResolvedValue([
      { targetType: "opportunity", targetId: "o1", kind: "PROPOSAL", title: "2 drafts ready" },
      { targetType: "opportunity", targetId: "o2", kind: "FLAG", title: "deadline moved" },
    ]);
    const map = await getOpenAttentionByTarget("u1", "opportunity");
    expect(map.get("o1")?.[0].title).toBe("2 drafts ready");
    expect(map.get("o2")?.[0].kind).toBe("FLAG");
  });

  it("returns an empty map on table-missing", async () => {
    findMany.mockRejectedValueOnce(new Error("relation does not exist"));
    const map = await getOpenAttentionByTarget("u1", "opportunity");
    expect(map.size).toBe(0);
  });
});
