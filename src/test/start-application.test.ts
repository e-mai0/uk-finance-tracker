import { describe, it, expect, vi, beforeEach } from "vitest";

const { findFirst, create, findUnique, authMock, revalidatePath } = vi.hoisted(
  () => ({
    findFirst: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    authMock: vi.fn(),
    revalidatePath: vi.fn(),
  }),
);

vi.mock("@/server/db", () => ({
  prisma: {
    application: { findFirst, create },
    opportunity: { findUnique },
  },
}));
vi.mock("@/server/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/engine/outcomes", () => ({
  distillOutcomesForUser: vi.fn(),
}));

import { startApplication } from "@/server/actions/applications";

beforeEach(() => {
  findFirst.mockReset();
  create.mockReset();
  findUnique.mockReset();
  revalidatePath.mockReset();
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u1" } });
});

describe("startApplication", () => {
  it("creates a DRAFT application linked to the opportunity", async () => {
    findUnique.mockResolvedValue({
      id: "o1",
      title: "SWE Intern",
      applicationUrl: "https://jobs.example.com/x",
      employer: { name: "J.P. Morgan" },
    });
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "app1" });

    const res = await startApplication("o1");

    expect(res).toEqual({ ok: true, applicationId: "app1" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          opportunityId: "o1",
          status: "DRAFT",
          source: "MANUAL",
          employerName: "J.P. Morgan",
          roleTitle: "SWE Intern",
          externalUrl: "https://jobs.example.com/x",
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/applications");
  });

  it("falls back to a synthetic tracker URL when the opportunity has no applicationUrl", async () => {
    findUnique.mockResolvedValue({
      id: "o2",
      title: "Markets Intern",
      applicationUrl: null,
      employer: { name: "Barclays" },
    });
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "app2" });

    const res = await startApplication("o2");

    expect(res).toEqual({ ok: true, applicationId: "app2" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ externalUrl: "tracker:o2" }),
      }),
    );
  });

  it("returns the existing application instead of duplicating", async () => {
    findUnique.mockResolvedValue({
      id: "o1",
      title: "t",
      applicationUrl: "u",
      employer: { name: "e" },
    });
    findFirst.mockResolvedValue({ id: "existing" });

    const res = await startApplication("o1");

    expect(res).toEqual({ ok: true, applicationId: "existing" });
    expect(create).not.toHaveBeenCalled();
  });

  it("errors when unauthenticated", async () => {
    authMock.mockResolvedValue(null);

    const res = await startApplication("o1");

    expect(res).toEqual({ error: "Your session has expired. Sign in again." });
    expect(create).not.toHaveBeenCalled();
  });

  it("errors when the opportunity does not exist", async () => {
    findUnique.mockResolvedValue(null);

    const res = await startApplication("missing");

    expect(res).toEqual({ error: "Opportunity not found." });
    expect(create).not.toHaveBeenCalled();
  });
});
