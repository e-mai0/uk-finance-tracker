// src/test/cv-known-profile.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { userFind, profileFind, applyFind, memRead } = vi.hoisted(() => ({
  userFind: vi.fn(),
  profileFind: vi.fn(),
  applyFind: vi.fn(),
  memRead: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: userFind },
    profile: { findUnique: profileFind },
    applyProfile: { findUnique: applyFind },
  },
}));
vi.mock("@/server/memory/service", () => ({ memoryService: { read: memRead } }));

import { gatherKnownProfile, knownToBaselineCv, toPromptBlock } from "@/server/cv/known-profile";

beforeEach(() => {
  vi.clearAllMocks();
  userFind.mockResolvedValue({ name: "Eric Mai", email: "x@cam.ac.uk" });
  profileFind.mockResolvedValue({
    university: "University of Cambridge",
    degreeSubject: "Economics",
    degreeType: "BA",
    graduationYear: 2028,
    currentYear: 1,
  });
  applyFind.mockResolvedValue({
    phone: "+44 7877",
    addressCity: "Cambridge",
    linkedinUrl: "linkedin.com/in/eric",
    githubUrl: null,
    websiteUrl: null,
    cvText: "Eric Mai\nEconomics, Cambridge",
  });
  memRead.mockResolvedValue({ content: "# profile\n- cv highlight 1: Won the Oxbridge AI Hackathon (2026)\n- target role: IBD\n" });
});

describe("gatherKnownProfile", () => {
  it("assembles all four sources", async () => {
    const p = await gatherKnownProfile("u1");
    expect(p.fullName).toBe("Eric Mai");
    expect(p.university).toBe("University of Cambridge");
    expect(p.phone).toBe("+44 7877");
    expect(p.uploadedCvText).toContain("Economics");
    expect(p.memoryFacts).toContain("cv highlight 1: Won the Oxbridge AI Hackathon (2026)");
  });

  it("tolerates missing rows", async () => {
    profileFind.mockResolvedValue(null);
    applyFind.mockResolvedValue(null);
    memRead.mockResolvedValue(null);
    const p = await gatherKnownProfile("u1");
    expect(p.fullName).toBe("Eric Mai");
    expect(p.university).toBeUndefined();
    expect(p.memoryFacts).toEqual([]);
  });
});

describe("knownToBaselineCv", () => {
  it("seeds contact and education deterministically", () => {
    const cv = knownToBaselineCv({
      fullName: "Eric Mai",
      email: "x@cam.ac.uk",
      phone: "+44 7877",
      linkedin: "linkedin.com/in/eric",
      university: "University of Cambridge",
      degreeSubject: "Economics",
      degreeType: "BA",
      graduationYear: 2028,
      memoryFacts: [],
    });
    expect(cv.fullName).toBe("Eric Mai");
    expect(cv.contact.email).toBe("x@cam.ac.uk");
    expect(cv.education[0].institution).toBe("University of Cambridge");
    expect(cv.education[0].qualification).toBe("Economics BA");
    expect(cv.education[0].dates).toContain("2028");
  });

  it("omits education when no university is known", () => {
    const cv = knownToBaselineCv({ fullName: "Nmeso", memoryFacts: [] });
    expect(cv.education).toEqual([]);
  });
});

describe("toPromptBlock", () => {
  it("includes known fields and omits absent ones", () => {
    const block = toPromptBlock({ fullName: "Eric Mai", university: "Cambridge", memoryFacts: ["cv highlight 1: won hackathon"] });
    expect(block).toContain("Eric Mai");
    expect(block).toContain("Cambridge");
    expect(block).toContain("won hackathon");
    expect(block).not.toContain("Phone:");
  });
});
