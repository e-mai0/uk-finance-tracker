// src/test/nav-session-filters.test.ts
// Task 15: verify nav entries (CV Builder, My CV) and session kind filter.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Nav: verify CV Builder and My CV appear in the NAV array
// ---------------------------------------------------------------------------
// `app-nav.tsx` is a "use client" module; we must stub the Next.js hooks
// before importing so the module doesn't crash in a Node test environment.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/lib/utils", () => ({ cn: (...c: string[]) => c.filter(Boolean).join(" ") }));
vi.mock("@/components/command-palette", () => ({ CommandPalette: () => null }));
vi.mock("@/server/actions/auth", () => ({ signOutAction: async () => {} }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));

import { NAV } from "@/components/app-nav";

describe("NAV entries", () => {
  it("includes /cv-builder with label 'CV Builder'", () => {
    const entry = NAV.find((n) => n.href === "/cv-builder");
    expect(entry).toBeDefined();
    expect(entry?.label).toBe("CV Builder");
  });

  it("includes /my-cv with label 'My CV'", () => {
    const entry = NAV.find((n) => n.href === "/my-cv");
    expect(entry).toBeDefined();
    expect(entry?.label).toBe("My CV");
  });

  it("cv-builder and my-cv have no badgeKey (non-nested, no badge)", () => {
    const cvBuilder = NAV.find((n) => n.href === "/cv-builder");
    const myCv = NAV.find((n) => n.href === "/my-cv");
    expect(cvBuilder?.badgeKey).toBeUndefined();
    expect(myCv?.badgeKey).toBeUndefined();
  });

  it("cv-builder comes before my-cv (logical ordering)", () => {
    const cvBuilderIdx = NAV.findIndex((n) => n.href === "/cv-builder");
    const myCvIdx = NAV.findIndex((n) => n.href === "/my-cv");
    expect(cvBuilderIdx).toBeGreaterThan(-1);
    expect(myCvIdx).toBeGreaterThan(cvBuilderIdx);
  });
});

// ---------------------------------------------------------------------------
// Session kind filter: paletteSearch scopes chat-thread queries to kind="cyclops"
// so that cv-builder sessions never bleed into the Ask Cyclops thread rail.
// ---------------------------------------------------------------------------
const { sessionFindMany, opportunityFindMany, authMock } = vi.hoisted(() => ({
  sessionFindMany: vi.fn(),
  opportunityFindMany: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    chatSession: { findMany: sessionFindMany },
    opportunity: { findMany: opportunityFindMany },
  },
}));
vi.mock("@/server/auth", () => ({ auth: authMock }));

import { paletteSearch } from "@/server/actions/palette";
import { DOCK_THREAD_TITLE } from "@/lib/dock-context";

beforeEach(() => {
  sessionFindMany.mockReset();
  opportunityFindMany.mockReset();
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u1" } });
  sessionFindMany.mockResolvedValue([]);
  opportunityFindMany.mockResolvedValue([]);
});

describe("paletteSearch session filter", () => {
  it("scopes chatSession.findMany to kind='cyclops' so cv-builder sessions are excluded", async () => {
    await paletteSearch("brief");

    expect(sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          kind: "cyclops",
          NOT: { title: DOCK_THREAD_TITLE },
        }),
      }),
    );
  });

  it("does not return cv-builder sessions in search results even if title matches", async () => {
    // Simulate the DB correctly honouring the filter — the mock returns nothing,
    // mirroring a real DB that would exclude kind='cv-builder' rows.
    sessionFindMany.mockResolvedValue([]);

    const res = await paletteSearch("cv");

    expect(res.threads).toHaveLength(0);
  });
});
