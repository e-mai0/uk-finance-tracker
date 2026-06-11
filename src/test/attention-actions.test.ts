import { describe, it, expect, vi, beforeEach } from "vitest";

const { updateMany, gqUpdateMany, resolveByKeyMock, authMock, revalidateMock } =
  vi.hoisted(() => ({
    updateMany: vi.fn(),
    gqUpdateMany: vi.fn(),
    resolveByKeyMock: vi.fn(),
    authMock: vi.fn(),
    revalidateMock: vi.fn(),
  }));

vi.mock("@/server/db", () => ({
  prisma: {
    attentionItem: { updateMany },
    gardenerQuestion: { updateMany: gqUpdateMany },
  },
}));
vi.mock("@/server/auth", () => ({ auth: authMock }));
vi.mock("@/server/attention", () => ({ resolveAttentionByKey: resolveByKeyMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

import {
  resolveAttention,
  snoozeAttention,
  resolveGardenerQuestion,
} from "@/server/actions/attention";

beforeEach(() => {
  updateMany.mockReset();
  gqUpdateMany.mockReset();
  resolveByKeyMock.mockReset();
  authMock.mockReset();
  revalidateMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u1" } });
});

describe("resolveAttention", () => {
  it("resolves an owned item and revalidates /today", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const res = await resolveAttention("a1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "a1", userId: "u1" },
      data: { status: "RESOLVED", resolvedAt: expect.any(Date) },
    });
    expect(revalidateMock).toHaveBeenCalledWith("/today");
    expect(res).toEqual({ ok: true });
  });

  it("errors on a foreign or missing id (count 0) without revalidating", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const res = await resolveAttention("not-mine");

    expect(res).toEqual({ error: "Not found." });
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("errors when unauthenticated and touches no data", async () => {
    authMock.mockResolvedValue(null);

    const res = await resolveAttention("a1");

    expect(res).toEqual({ error: "Your session has expired. Sign in again." });
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("snoozeAttention", () => {
  it("snoozes an owned item until tomorrow morning and revalidates /today", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const before = Date.now();

    const res = await snoozeAttention("a1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "a1", userId: "u1" },
      data: { status: "SNOOZED", snoozedUntil: expect.any(Date) },
    });
    const until: Date = updateMany.mock.calls[0][0].data.snoozedUntil;
    // Future, and within the next ~31 hours (tomorrow 06:00 UTC ≈ 07:00 London).
    expect(until.getTime()).toBeGreaterThan(before);
    expect(until.getTime() - before).toBeLessThanOrEqual(31 * 60 * 60 * 1000);
    expect(until.getUTCHours()).toBe(6);
    expect(until.getUTCMinutes()).toBe(0);
    expect(revalidateMock).toHaveBeenCalledWith("/today");
    expect(res).toEqual({ ok: true });
  });

  it("errors on a foreign or missing id (count 0)", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const res = await snoozeAttention("not-mine");

    expect(res).toEqual({ error: "Not found." });
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("errors when unauthenticated and touches no data", async () => {
    authMock.mockResolvedValue(null);

    const res = await snoozeAttention("a1");

    expect(res).toEqual({ error: "Your session has expired. Sign in again." });
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("resolveGardenerQuestion", () => {
  it("resolves an owned question, its attention item, and revalidates /memory + /today", async () => {
    gqUpdateMany.mockResolvedValue({ count: 1 });

    const res = await resolveGardenerQuestion("g1");

    expect(gqUpdateMany).toHaveBeenCalledWith({
      where: { id: "g1", userId: "u1" },
      data: { status: "resolved" },
    });
    expect(resolveByKeyMock).toHaveBeenCalledWith("u1", "gq:g1");
    expect(revalidateMock).toHaveBeenCalledWith("/memory");
    expect(revalidateMock).toHaveBeenCalledWith("/today");
    expect(res).toEqual({ ok: true });
  });

  it("errors on a foreign or missing id (count 0) without side effects", async () => {
    gqUpdateMany.mockResolvedValue({ count: 0 });

    const res = await resolveGardenerQuestion("not-mine");

    expect(res).toEqual({ error: "Not found." });
    expect(resolveByKeyMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("errors when unauthenticated and touches no data", async () => {
    authMock.mockResolvedValue(null);

    const res = await resolveGardenerQuestion("g1");

    expect(res).toEqual({ error: "Your session has expired. Sign in again." });
    expect(gqUpdateMany).not.toHaveBeenCalled();
    expect(resolveByKeyMock).not.toHaveBeenCalled();
  });
});
