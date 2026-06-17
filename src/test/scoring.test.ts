import { describe, it, expect } from "vitest";
import {
  scoreOpportunity,
  fitTier,
  INTERNSHIP_CYCLE_SUMMER_YEAR,
  WEIGHTS,
  type ScoreProfile,
  type ScorePreferences,
  type ScoreOpportunity,
} from "../lib/scoring";

// ---------------------------------------------------------------------------
// Base fixtures
// ---------------------------------------------------------------------------

const baseProfile: ScoreProfile = {
  workAuth: "UK_CITIZEN",
  graduationYear: INTERNSHIP_CYCLE_SUMMER_YEAR + 1, // ideal penultimate year
  currentYear: 2,
  skills: ["excel"],
  // "Economics" aligns with IB / ASSET_MGMT / CORP_BANKING → +degreeAffinity
  degreeSubject: "Economics",
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

// ---------------------------------------------------------------------------
// Core behavior tests
// ---------------------------------------------------------------------------

describe("scoreOpportunity", () => {
  it("awards a perfect score when everything aligns", () => {
    // Breakdown: roleFamily(25) + timing(12) + location(18) + workAuth(12)
    //            + employer(13) + skills(10) + degreeAffinity(10) = 100
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
    // Was 70 (old: 100-30). Now 75 (new: 100-25) because roleFamily weight is 25.
    // degreeSubject="Economics" still fires because affinity checks oppRoleFamily (IB), not prefs.
    expect(score).toBe(75);
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
    // Old: delta was 15 (old WEIGHTS.workAuth). New: delta is 12 (new WEIGHTS.workAuth).
    expect(withoutAuth.score).toBe(withAuth.score - WEIGHTS.workAuth);
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
// Degree-subject affinity — new behavior tests (TDD: written before impl)
// ---------------------------------------------------------------------------

describe("degree-subject affinity", () => {
  // A quant/markets opportunity
  const quantOpp: ScoreOpportunity = {
    roleFamily: "QUANT",
    location: "London",
    employerName: "Two Sigma",
    sponsorshipInfo: null,
    eligibilityNotes: null,
    tags: ["python", "statistics"],
    title: "Quantitative Research Intern",
  };

  const quantPrefs: ScorePreferences = {
    targetRoleFamilies: ["QUANT"],
    preferredLocations: ["London"],
    openToAnywhereUk: false,
    targetEmployers: [],
  };

  it("aligned degree scores higher than unrelated degree on the same opportunity", () => {
    // Mathematics aligns with QUANT → should earn affinity points
    const alignedProfile: ScoreProfile = {
      ...baseProfile,
      skills: [],
      degreeSubject: "Mathematics",
    };
    // History has no affinity with QUANT
    const unrelatedProfile: ScoreProfile = {
      ...baseProfile,
      skills: [],
      degreeSubject: "History",
    };
    const aligned = scoreOpportunity(alignedProfile, quantPrefs, quantOpp);
    const unrelated = scoreOpportunity(unrelatedProfile, quantPrefs, quantOpp);
    expect(aligned.score).toBeGreaterThan(unrelated.score);
  });

  it("Physics aligns with QUANT role family", () => {
    const profile: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Physics" };
    const noAffinity: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Law" };
    const withAffinity = scoreOpportunity(profile, quantPrefs, quantOpp);
    const without = scoreOpportunity(noAffinity, quantPrefs, quantOpp);
    expect(withAffinity.score).toBeGreaterThan(without.score);
  });

  it("Computer Science aligns with QUANT and Technology-adjacent families", () => {
    const profile: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Computer Science" };
    const noAffinity: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Art History" };
    const withAffinity = scoreOpportunity(profile, quantPrefs, quantOpp);
    const without = scoreOpportunity(noAffinity, quantPrefs, quantOpp);
    expect(withAffinity.score).toBeGreaterThan(without.score);
  });

  it("Economics aligns with IB role family", () => {
    const profile: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Economics" };
    const noAffinity: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Classics" };
    const withAffinity = scoreOpportunity(profile, basePrefs, baseOpp);
    const without = scoreOpportunity(noAffinity, basePrefs, baseOpp);
    expect(withAffinity.score).toBeGreaterThan(without.score);
  });

  it("Finance aligns with ASSET_MGMT role family", () => {
    const amOpp: ScoreOpportunity = { ...baseOpp, roleFamily: "ASSET_MGMT" };
    const amPrefs: ScorePreferences = { ...basePrefs, targetRoleFamilies: ["ASSET_MGMT"] };
    const profile: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Finance" };
    const noAffinity: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Sociology" };
    const withAffinity = scoreOpportunity(profile, amPrefs, amOpp);
    const without = scoreOpportunity(noAffinity, amPrefs, amOpp);
    expect(withAffinity.score).toBeGreaterThan(without.score);
  });

  it("Statistics aligns with MARKETS role family", () => {
    const marketsOpp: ScoreOpportunity = { ...baseOpp, roleFamily: "MARKETS" };
    const marketsPrefs: ScorePreferences = { ...basePrefs, targetRoleFamilies: ["MARKETS"] };
    const profile: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Statistics" };
    const noAffinity: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Philosophy" };
    const withAffinity = scoreOpportunity(profile, marketsPrefs, marketsOpp);
    const without = scoreOpportunity(noAffinity, marketsPrefs, marketsOpp);
    expect(withAffinity.score).toBeGreaterThan(without.score);
  });

  it("empty degreeSubject is neutral — no bonus, no penalty vs a known-unrelated subject", () => {
    // Unrelated subject (no affinity with QUANT) should score the same as empty
    const emptyProfile: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "" };
    const unrelatedProfile: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Medieval History" };
    const empty = scoreOpportunity(emptyProfile, quantPrefs, quantOpp);
    const unrelated = scoreOpportunity(unrelatedProfile, quantPrefs, quantOpp);
    // Both get zero affinity bonus
    expect(empty.score).toBe(unrelated.score);
  });

  it("undefined degreeSubject is neutral — no penalty vs a missing subject", () => {
    const noSubject: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: undefined };
    const unrelated: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Drama" };
    const without = scoreOpportunity(noSubject, quantPrefs, quantOpp);
    const withUnrelated = scoreOpportunity(unrelated, quantPrefs, quantOpp);
    expect(without.score).toBe(withUnrelated.score);
  });

  it("a perfect-aligned profile (aligned degree + all other matches) reaches 100", () => {
    // All sub-scores fire: roleFamily(25) + timing(12) + location(18) + workAuth(12)
    //                     + employer(13) + skills(10) + degreeAffinity(10) = 100
    const perfectPrefs: ScorePreferences = {
      targetRoleFamilies: ["QUANT"],
      preferredLocations: ["London"],
      openToAnywhereUk: false,
      targetEmployers: ["Two Sigma"],
    };
    const perfectProfile: ScoreProfile = {
      workAuth: "UK_CITIZEN",
      graduationYear: INTERNSHIP_CYCLE_SUMMER_YEAR + 1,
      currentYear: 2,
      skills: ["python"],
      degreeSubject: "Mathematics",
    };
    const { score } = scoreOpportunity(perfectProfile, perfectPrefs, quantOpp);
    expect(score).toBe(100);
  });

  it("the affinity reason is included when degree aligns", () => {
    const profile: ScoreProfile = { ...baseProfile, skills: [], degreeSubject: "Mathematics" };
    const { reasons } = scoreOpportunity(profile, quantPrefs, quantOpp);
    expect(reasons.some((r) => r.toLowerCase().includes("degree"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Skills weight tests — skills must move ordering meaningfully (AC: > 5/100)
// ---------------------------------------------------------------------------

describe("skills weight", () => {
  it("skills weight is greater than the old 5 points", () => {
    expect(WEIGHTS.skills).toBeGreaterThan(5);
  });

  it("matching skills changes score by at least 8 points", () => {
    const withSkills = scoreOpportunity(baseProfile, basePrefs, baseOpp);
    const noSkills = scoreOpportunity({ ...baseProfile, skills: [] }, basePrefs, baseOpp);
    expect(withSkills.score - noSkills.score).toBeGreaterThanOrEqual(8);
  });
});
