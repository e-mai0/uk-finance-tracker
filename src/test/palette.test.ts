import { describe, it, expect, vi, beforeEach } from "vitest";

const { opportunityFindMany, sessionFindMany, authMock } = vi.hoisted(() => ({
  opportunityFindMany: vi.fn(),
  sessionFindMany: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    opportunity: { findMany: opportunityFindMany },
    chatSession: { findMany: sessionFindMany },
  },
}));
vi.mock("@/server/auth", () => ({ auth: authMock }));

import { paletteSearch } from "@/server/actions/palette";
import { DOCK_THREAD_TITLE } from "@/lib/dock-context";

beforeEach(() => {
  opportunityFindMany.mockReset();
  sessionFindMany.mockReset();
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u1" } });
  opportunityFindMany.mockResolvedValue([]);
  sessionFindMany.mockResolvedValue([]);
});

describe("paletteSearch", () => {
  it("returns empty results when unauthenticated and touches no data", async () => {
    authMock.mockResolvedValue(null);

    const res = await paletteSearch("goldman");

    expect(res).toEqual({ listings: [], threads: [] });
    expect(opportunityFindMany).not.toHaveBeenCalled();
    expect(sessionFindMany).not.toHaveBeenCalled();
  });

  it("returns empty results for a trimmed query under 2 chars without querying", async () => {
    const res = await paletteSearch("  g  ");

    expect(res).toEqual({ listings: [], threads: [] });
    expect(opportunityFindMany).not.toHaveBeenCalled();
    expect(sessionFindMany).not.toHaveBeenCalled();
  });

  it("maps listings to 'Employer — Title' labels and threads to titles", async () => {
    opportunityFindMany.mockResolvedValue([
      { id: "o1", title: "Summer Internship", employer: { name: "Goldman Sachs" } },
    ]);
    sessionFindMany.mockResolvedValue([{ id: "t1", title: "Goldman prep" }]);

    const res = await paletteSearch(" goldman ");

    expect(res).toEqual({
      listings: [{ id: "o1", label: "Goldman Sachs — Summer Internship" }],
      threads: [{ id: "t1", label: "Goldman prep" }],
    });
  });

  it("searches opportunity title OR employer name case-insensitively, take 5, with employer", async () => {
    await paletteSearch("goldman");

    expect(opportunityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { title: { contains: "goldman", mode: "insensitive" } },
            { employer: { name: { contains: "goldman", mode: "insensitive" } } },
          ],
        },
        include: { employer: true },
        take: 5,
      }),
    );
  });

  it("scopes threads to the user, excludes the dock thread, take 5", async () => {
    await paletteSearch("brief");

    expect(sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "u1",
          title: { contains: "brief", mode: "insensitive" },
          NOT: { title: DOCK_THREAD_TITLE },
        },
        take: 5,
      }),
    );
  });
});
