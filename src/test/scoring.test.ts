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
});

describe("fitTier", () => {
  it("maps scores to tiers", () => {
    expect(fitTier(90)).toBe("strong");
    expect(fitTier(60)).toBe("good");
    expect(fitTier(40)).toBe("moderate");
    expect(fitTier(10)).toBe("low");
  });
});
