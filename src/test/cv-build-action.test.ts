// src/test/cv-build-action.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// server-only throws when imported outside React Server Components; stub it out
// so the test runner (Node/vitest) can import server files without error.
vi.mock("server-only", () => ({}));

const { userFindUnique, applyFindUnique, builtUpsert } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  applyFindUnique: vi.fn(),
  builtUpsert: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    applyProfile: { findUnique: applyFindUnique },
    builtCv: { upsert: builtUpsert },
  },
}));
vi.mock("@/server/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/server/cv/grounding", () => ({ syncCvGrounding: vi.fn() }));

import { buildCv } from "@/server/actions/cv";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY; // force deterministic path
  userFindUnique.mockResolvedValue({ name: "Eric Mai", email: "x@cam.ac.uk" });
  applyFindUnique.mockResolvedValue({ phone: "+44 7877", linkedinUrl: "linkedin.com/in/eric" });
  builtUpsert.mockResolvedValue({});
});

describe("buildCv (no API key → deterministic)", () => {
  it("builds and persists a CV from form input", async () => {
    const res = await buildCv({
      education: [{ institution: "Cambridge", qualification: "Economics BA", startYear: "2025", endYear: "2028", grade: "First" }],
      accomplishments: [],
      projects: [{ name: "QuantiHack", skills: "Python, FastAPI", description: "Built a tool" }],
    });
    expect(res.ok).toBe(true);
    expect(res.cv?.fullName).toBe("Eric Mai");
    expect(res.cv?.contact.phone).toBe("+44 7877");
    expect(res.cv?.education[0].dates).toBe("2025 – 2028");
    expect(builtUpsert).toHaveBeenCalledOnce();
  });

  it("returns fieldErrors on invalid input", async () => {
    const res = await buildCv({ education: "nope" } as never);
    expect(res.ok).toBeUndefined();
    expect(res.fieldErrors).toBeTruthy();
  });
});
