import { describe, it, expect } from "vitest";
import {
  scoreOpportunity,
  fitTier,
  INTERNSHIP_CYCLE_SUMMER_YEAR,
  type ScoreProfile,
  type ScorePreferences,
  type ScoreOpportunity,
} from "../lib/scoring";

const baseProfile: ScoreProfile = {
  workAuth: "UK_CITIZEN",
  graduationYear: INTERNSHIP_CYCLE_SUMMER_YEAR + 1, // ideal penultimate year
  currentYear: 2,
  skills: ["excel"],
};

const basePrefs: ScorePreferences = {
  targetRoleFamilies: ["IB"],
  preferredLocations: ["London"],
  openToAnywhereUk: false,
  targetEmployers: ["Goldman Sachs"],
};

const baseOpp: ScoreOpportunity = {
  roleFamily: "IB",
  location: "London",
  employerName: "Goldman Sachs",
  sponsorshipInfo: "Visa sponsorship is typically available.",
  eligibilityNotes: null,
  tags: ["excel", "m&a"],
  title: "Investment Banking Summer Analyst",
};

describe("scoreOpportunity", () => {
  it("awards a perfect score when everything aligns", () => {
    const { score, reasons } = scoreOpportunity(baseProfile, basePrefs, baseOpp);
    expect(score).toBe(100);
    expect(reasons.length).toBeGreaterThanOrEqual(5);
  });

  it("is deterministic for identical inputs", () => {
    const a = scoreOpportunity(baseProfile, basePrefs, baseOpp);
    const b = scoreOpportunity(baseProfile, basePrefs, baseOpp);
    expect(a).toEqual(b);
  });

  it("drops the role-family points when the family is not targeted", () => {
    const prefs = { ...basePrefs, targetRoleFamilies: ["MARKETS" as const] };
    const { score } = scoreOpportunity(baseProfile, prefs, baseOpp);
    // Loses the 30-point role-family contribution.
    expect(score).toBe(70);
  });

  it("penalizes a visa-required student when sponsorship is explicitly refused", () => {
    const profile = { ...baseProfile, workAuth: "UK_VISA_REQUIRED" as const };
    const opp = {
      ...baseOpp,
      sponsorshipInfo:
        "This employer cannot offer visa sponsorship for internships.",
    };
    const { score, reasons } = scoreOpportunity(profile, basePrefs, opp);
    const citizen = scoreOpportunity(baseProfile, basePrefs, baseOpp);
    expect(score).toBeLessThan(citizen.score);
    expect(reasons.some((r) => r.startsWith("⚠"))).toBe(true);
  });

  it("clamps the score to the 0–100 range", () => {
    const { score } = scoreOpportunity(baseProfile, basePrefs, baseOpp);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("rewards ideal penultimate-year timing over off-cycle timing", () => {
    const offCycle = { ...baseProfile, graduationYear: INTERNSHIP_CYCLE_SUMMER_YEAR + 5 };
    const ideal = scoreOpportunity(baseProfile, basePrefs, baseOpp);
    const off = scoreOpportunity(offCycle, basePrefs, baseOpp);
    expect(ideal.score).toBeGreaterThan(off.score);
  });

  it("gives partial location credit when open to anywhere in the UK", () => {
    const prefs = {
      ...basePrefs,
      preferredLocations: [],
      openToAnywhereUk: true,
    };
    const opp = { ...baseOpp, location: "Edinburgh" };
    const { reasons } = scoreOpportunity(baseProfile, prefs, opp);
    expect(reasons.some((r) => r.toLowerCase().includes("anywhere"))).toBe(true);
  });

  it("skips the work-auth section entirely when workAuth is unknown", () => {
    const unknownAuth: ScoreProfile = { ...baseProfile, workAuth: null };
    const withAuth = scoreOpportunity(baseProfile, basePrefs, baseOpp);
    const withoutAuth = scoreOpportunity(unknownAuth, basePrefs, baseOpp);
    // baseProfile is UK_CITIZEN (+15); null gets neither bonus nor penalty.
    expect(withoutAuth.score).toBe(withAuth.score - 15);
    expect(withoutAuth.reasons.join(" ")).not.toMatch(/sponsorship|eligible to work/i);
  });
});

describe("fitTier", () => {
  it("maps scores to tiers", () => {
    expect(fitTier(90)).toBe("strong");
    expect(fitTier(60)).toBe("good");
    expect(fitTier(40)).toBe("moderate");
    expect(fitTier(10)).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// Skills sub-score matching
// ---------------------------------------------------------------------------

/**
 * Minimal fixtures used across skills tests.
 * baseOpp (IB/London/Goldman) already has tags ["excel","m&a"] and the title
 * "Investment Banking Summer Analyst", so it conveniently exercises title-word
 * matching too.  These local overrides layer on top.
 */

describe("skills sub-score — multi-word phrase matching", () => {
  it("matches a multi-word student skill against a tag that is an exact phrase", () => {
    // "financial modelling" is one skill string; the opp has it as a tag.
    // Old code would split the tag into "financial"/"modelling" tokens and the
    // Set lookup for the whole string "financial modelling" would miss.
    const profile: ScoreProfile = {
      ...baseProfile,
      skills: ["financial modelling"],
    };
    const opp: ScoreOpportunity = {
      ...baseOpp,
      tags: ["financial modelling"],
      title: "Summer Internship",
    };
    const { score, reasons } = scoreOpportunity(profile, basePrefs, opp);
    expect(score).toBeGreaterThanOrEqual(5); // skills credit fires
    expect(reasons.some((r) => r.toLowerCase().includes("financial modelling"))).toBe(true);
  });

  it("matches a multi-word student skill that appears as a phrase in the title", () => {
    // Title contains "Financial Modelling" (mixed case); skill is "financial modelling".
    const profile: ScoreProfile = {
      ...baseProfile,
      skills: ["financial modelling"],
    };
    const opp: ScoreOpportunity = {
      ...baseOpp,
      tags: [],
      title: "Financial Modelling Summer Analyst",
    };
    const { score, reasons } = scoreOpportunity(profile, basePrefs, opp);
    expect(score).toBeGreaterThanOrEqual(5);
    expect(reasons.some((r) => r.toLowerCase().includes("financial modelling"))).toBe(true);
  });

  it("still matches a single-word skill the same as before", () => {
    // Regression: single-word "python" should still fire.
    const profile: ScoreProfile = { ...baseProfile, skills: ["python"] };
    const opp: ScoreOpportunity = {
      ...baseOpp,
      tags: ["python"],
      title: "Quantitative Analyst",
    };
    const { score } = scoreOpportunity(profile, basePrefs, opp);
    expect(score).toBeGreaterThanOrEqual(5);
  });
});

describe("skills sub-score — normalisation (case & punctuation)", () => {
  it("matches 'M&A' skill against an 'm&a' tag case-insensitively", () => {
    // baseOpp already has tag "m&a"; skill "M&A" should normalise to the same.
    const profile: ScoreProfile = { ...baseProfile, skills: ["M&A"] };
    const { score, reasons } = scoreOpportunity(profile, basePrefs, baseOpp);
    expect(score).toBeGreaterThanOrEqual(5);
    expect(reasons.some((r) => r.toLowerCase().includes("m&a"))).toBe(true);
  });

  it("matches 'data-analysis' skill against 'data analysis' tag (hyphen ↔ space)", () => {
    const profile: ScoreProfile = { ...baseProfile, skills: ["data-analysis"] };
    const opp: ScoreOpportunity = {
      ...baseOpp,
      tags: ["data analysis"],
      title: "Analyst",
    };
    const { reasons } = scoreOpportunity(profile, basePrefs, opp);
    // The skills-overlap reason must fire (other dimensions are unchanged by
    // the skills list, so we check the reason rather than total score).
    expect(reasons.some((r) => /your skills overlap/i.test(r))).toBe(true);
  });

  it("matches 'data analysis' skill against 'data-analysis' tag (space ↔ hyphen)", () => {
    const profile: ScoreProfile = { ...baseProfile, skills: ["data analysis"] };
    const opp: ScoreOpportunity = {
      ...baseOpp,
      tags: ["data-analysis"],
      title: "Analyst",
    };
    const { reasons } = scoreOpportunity(profile, basePrefs, opp);
    expect(reasons.some((r) => /your skills overlap/i.test(r))).toBe(true);
  });
});

describe("skills sub-score — false-positive prevention (word-boundary)", () => {
  it("does NOT match 'java' against a title/tags containing only 'javascript'", () => {
    // Critical: substring match would fire; word-boundary match must not.
    const profile: ScoreProfile = { ...baseProfile, skills: ["java"] };
    const opp: ScoreOpportunity = {
      ...baseOpp,
      tags: ["javascript"],
      title: "Front-End Developer JavaScript",
    };
    const { reasons } = scoreOpportunity(profile, basePrefs, opp);
    // The skills reason must not mention java (no skills credit for java alone).
    expect(reasons.some((r) => /your skills overlap/i.test(r))).toBe(false);
  });

  it("does NOT match single-letter skill 'r' against arbitrary words", () => {
    // "r" as a skill (R programming language) must not match words like
    // "research", "review", "internship" which contain the letter r.
    const profile: ScoreProfile = { ...baseProfile, skills: ["r"] };
    const opp: ScoreOpportunity = {
      ...baseOpp,
      tags: ["research", "internship"],
      title: "Research Analyst Role",
    };
    const { reasons } = scoreOpportunity(profile, basePrefs, opp);
    expect(reasons.some((r) => /your skills overlap/i.test(r))).toBe(false);
  });

  it("does NOT match 'mna' against an opp tagged 'm&a'", () => {
    // After normalisation "m&a" should not become "mna" and vice versa.
    const profile: ScoreProfile = { ...baseProfile, skills: ["mna"] };
    const opp: ScoreOpportunity = {
      ...baseOpp,
      tags: ["m&a"],
      title: "Analyst",
    };
    const { reasons } = scoreOpportunity(profile, basePrefs, opp);
    expect(reasons.some((r) => /your skills overlap/i.test(r))).toBe(false);
  });
});

describe("skills sub-score — no overlap → zero credit", () => {
  it("gives no skills credit and no spurious reason when skills are disjoint", () => {
    const profile: ScoreProfile = { ...baseProfile, skills: ["accounting", "powerpoint"] };
    const opp: ScoreOpportunity = {
      ...baseOpp,
      tags: ["python", "sql"],
      title: "Quantitative Analyst",
    };
    const { reasons } = scoreOpportunity(profile, basePrefs, opp);
    expect(reasons.some((r) => /your skills overlap/i.test(r))).toBe(false);
  });
});

describe("skills sub-score — reason lists matched skills (up to 3)", () => {
  it("names the matched skill in the reason string", () => {
    const profile: ScoreProfile = { ...baseProfile, skills: ["financial modelling"] };
    const opp: ScoreOpportunity = {
      ...baseOpp,
      tags: ["financial modelling", "valuation"],
      title: "Valuation Analyst",
    };
    const { reasons } = scoreOpportunity(profile, basePrefs, opp);
    const skillReason = reasons.find((r) => /your skills overlap/i.test(r));
    expect(skillReason).toBeDefined();
    expect(skillReason!.toLowerCase()).toContain("financial modelling");
  });

  it("lists at most 3 matched skills in the reason", () => {
    const profile: ScoreProfile = {
      ...baseProfile,
      skills: ["python", "sql", "excel", "vba"],
    };
    const opp: ScoreOpportunity = {
      ...baseOpp,
      tags: ["python", "sql", "excel", "vba"],
      title: "Analyst",
    };
    const { reasons } = scoreOpportunity(profile, basePrefs, opp);
    const skillReason = reasons.find((r) => /your skills overlap/i.test(r));
    expect(skillReason).toBeDefined();
    // Reason text should list at most 3 skills (comma-separated inside parentheses).
    const inside = skillReason!.match(/\(([^)]+)\)/)?.[1] ?? "";
    const listed = inside.split(",").map((s) => s.trim()).filter(Boolean);
    expect(listed.length).toBeLessThanOrEqual(3);
  });
});

