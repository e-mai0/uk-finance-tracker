// src/test/cv-generate.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/ai/budget", () => ({
  checkBudget: vi.fn(async () => ({ ok: true })),
  recordUsage: vi.fn(),
}));

import { parseCvTextToCvData, draftCvDataFromKnown } from "@/server/cv/generate";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("parseCvTextToCvData (no API key)", () => {
  it("returns null when there is no API key", async () => {
    expect(await parseCvTextToCvData("u1", "Eric Mai\nCambridge")).toBeNull();
  });

  it("returns null for empty text", async () => {
    process.env.ANTHROPIC_API_KEY = "x";
    expect(await parseCvTextToCvData("u1", "   ")).toBeNull();
  });
});

describe("draftCvDataFromKnown (no API key → deterministic baseline)", () => {
  it("falls back to the deterministic baseline", async () => {
    const cv = await draftCvDataFromKnown("u1", {
      fullName: "Eric Mai",
      university: "University of Cambridge",
      degreeSubject: "Economics",
      degreeType: "BA",
      graduationYear: 2028,
      memoryFacts: [],
    });
    expect(cv.fullName).toBe("Eric Mai");
    expect(cv.education[0].institution).toBe("University of Cambridge");
  });
});
