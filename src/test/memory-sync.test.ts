import { describe, it, expect } from "vitest";
import { buildProfileFacts, applyFacts } from "@/server/memory/sync";
import { CANONICAL_TEMPLATES } from "@/server/memory/templates";

const fullProfile = {
  university: "University of Cambridge",
  degreeSubject: "Economics",
  degreeType: "BA",
  graduationYear: 2028,
  currentYear: 2,
  workAuth: "UK_CITIZEN" as const,
  skills: ["Excel", "Python"],
  gradeInfo: { aLevels: "A*A*A", gcseSummary: "9 9s", gpaOrEquivalent: "First" },
};

const fullPrefs = {
  targetRoleFamilies: ["IB", "QUANT"] as ("IB" | "QUANT")[],
  preferredLocations: ["London"],
  openToAnywhereUk: false,
  targetEmployers: ["Goldman Sachs"],
};

describe("buildProfileFacts", () => {
  it("emits every fact for a complete profile", () => {
    const facts = buildProfileFacts(fullProfile, fullPrefs);
    const labels = facts.map((f) => f.label);
    expect(labels).toEqual([
      "university",
      "degree",
      "graduation year",
      "current year of study",
      "work authorization",
      "skills",
      "grades",
      "targeting",
      "preferred locations",
      "target employers",
    ]);
    expect(facts.find((f) => f.label === "degree")!.value).toBe("BA Economics");
    expect(facts.find((f) => f.label === "targeting")!.value).toContain("Investment Banking");
  });

  it("omits absent optional facts and keeps the core four plus targeting", () => {
    const facts = buildProfileFacts(
      { ...fullProfile, workAuth: null, skills: [], gradeInfo: null },
      { ...fullPrefs, preferredLocations: [], openToAnywhereUk: false, targetEmployers: [] },
    );
    expect(facts.map((f) => f.label)).toEqual([
      "university",
      "degree",
      "graduation year",
      "current year of study",
      "targeting",
    ]);
  });

  it("falls back to 'anywhere in the UK' when open with no locations", () => {
    const facts = buildProfileFacts(fullProfile, {
      ...fullPrefs,
      preferredLocations: [],
      openToAnywhereUk: true,
    });
    expect(facts.find((f) => f.label === "preferred locations")!.value).toBe(
      "open to anywhere in the UK",
    );
  });

  it("handles missing preferences row", () => {
    const facts = buildProfileFacts(fullProfile, null);
    expect(facts.map((f) => f.label)).not.toContain("targeting");
    expect(facts.map((f) => f.label)).toContain("university");
  });
});

describe("applyFacts", () => {
  it("appends fact lines to the canonical template", () => {
    const out = applyFacts(
      CANONICAL_TEMPLATES["profile.md"],
      buildProfileFacts(fullProfile, fullPrefs),
      "2026-06-11",
    );
    expect(out).toContain(
      "- university: University of Cambridge (confidence: high, confirmed: 2026-06-11)",
    );
    expect(out).toContain("- graduation year: 2028 (confidence: high, confirmed: 2026-06-11)");
  });

  it("updates in place on re-sync instead of duplicating", () => {
    const first = applyFacts(
      CANONICAL_TEMPLATES["profile.md"],
      buildProfileFacts(fullProfile, fullPrefs),
      "2026-06-11",
    );
    const second = applyFacts(
      first,
      buildProfileFacts({ ...fullProfile, graduationYear: 2029 }, fullPrefs),
      "2026-06-12",
    );
    expect(second).toContain("- graduation year: 2029 (confidence: high, confirmed: 2026-06-12)");
    expect(second).not.toContain("graduation year: 2028");
    expect(second.match(/- university:/g)).toHaveLength(1);
  });
});
