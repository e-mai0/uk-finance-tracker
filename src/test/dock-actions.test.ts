import { describe, it, expect, vi, beforeEach } from "vitest";

const { sessionFindFirst, sessionCreate, messageFindMany, authMock } =
  vi.hoisted(() => ({
    sessionFindFirst: vi.fn(),
    sessionCreate: vi.fn(),
    messageFindMany: vi.fn(),
    authMock: vi.fn(),
  }));

vi.mock("@/server/db", () => ({
  prisma: {
    chatSession: { findFirst: sessionFindFirst, create: sessionCreate },
    chatMessage: { findMany: messageFindMany },
  },
}));
vi.mock("@/server/auth", () => ({ auth: authMock }));

import { getOrCreateDockThread } from "@/server/actions/dock";

beforeEach(() => {
  sessionFindFirst.mockReset();
  sessionCreate.mockReset();
  messageFindMany.mockReset();
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u1" } });
});

describe("getOrCreateDockThread", () => {
  it("returns the newest existing Dock session with its messages", async () => {
    sessionFindFirst.mockResolvedValue({ id: "dock1" });
    // Rows come back newest-first (createdAt desc, take 30) and must be
    // returned oldest-first.
    messageFindMany.mockResolvedValue([
      {
        id: "m2",
        clientId: "c2",
        role: "assistant",
        parts: JSON.stringify([{ type: "text", text: "hello back" }]),
      },
      {
        id: "m1",
        clientId: null,
        role: "user",
        parts: JSON.stringify([{ type: "text", text: "hello" }]),
      },
    ]);

    const res = await getOrCreateDockThread();

    expect(sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", title: "Dock" },
      }),
    );
    expect(sessionCreate).not.toHaveBeenCalled();
    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: "dock1" },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    );
    expect(res).toEqual({
      sessionId: "dock1",
      messages: [
        {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
        {
          id: "c2",
          role: "assistant",
          parts: [{ type: "text", text: "hello back" }],
        },
      ],
    });
  });

  it("creates the Dock session when none exists", async () => {
    sessionFindFirst.mockResolvedValue(null);
    sessionCreate.mockResolvedValue({ id: "fresh" });
    messageFindMany.mockResolvedValue([]);

    const res = await getOrCreateDockThread();

    expect(sessionCreate).toHaveBeenCalledWith({
      data: { userId: "u1", title: "Dock" },
    });
    expect(res).toEqual({ sessionId: "fresh", messages: [] });
  });

  it("errors when unauthenticated and touches no data", async () => {
    authMock.mockResolvedValue(null);

    const res = await getOrCreateDockThread();

    expect(res).toEqual({ error: "Your session has expired. Sign in again." });
    expect(sessionFindFirst).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
    expect(messageFindMany).not.toHaveBeenCalled();
  });
});
