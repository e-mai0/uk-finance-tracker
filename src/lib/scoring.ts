import type { RoleFamily, WorkAuth } from "@prisma/client";
import { ROLE_FAMILY_LABEL } from "./constants";

/**
 * Deterministic, transparent fit scoring.
 *
 * No ML. Each rule contributes a fixed weight and, when it fires, a
 * human-readable reason. The total is clamped to 0–100 so it reads as a
 * percentage-style match. The function is pure: same inputs → same output,
 * which is what the unit tests assert.
 *
 * Rebalance (Cycle 4 — degree-subject affinity):
 *   Old: roleFamily(30) + timing(15) + locationExact(20) + workAuth(15)
 *        + employer(15) + skills(5) = 100
 *   New: roleFamily(25) + timing(12) + locationExact(18) + workAuth(12)
 *        + employer(13) + skills(10) + degreeAffinity(10) = 100
 *   All incumbent weights trimmed proportionally to make room for degreeAffinity(10)
 *   and to double skills from 5 → 10 so academic/skills signals meaningfully move ranking.
 */

// The summer the seeded internships run. As of the 2026 build, the live cycle
// is summer 2027 (applications open autumn 2026). A penultimate-year applicant
// (the prime audience for UK summer internships) graduates the following year.
export const INTERNSHIP_CYCLE_SUMMER_YEAR = 2027;

export const WEIGHTS = {
  roleFamily: 25,       // was 30; trimmed to fund degreeAffinity + skills bump
  timing: 12,           // was 15; trimmed proportionally
  locationExact: 18,    // was 20; trimmed proportionally
  locationAnywhere: 9,  // was 10; trimmed proportionally
  workAuth: 12,         // was 15; trimmed proportionally
  workAuthVisaUnknown: 4, // was 5; trimmed proportionally
  employer: 13,         // was 15; trimmed proportionally
  skills: 10,           // was 5; doubled — skills now move ranking meaningfully
  degreeAffinity: 10,   // NEW — degree-subject → role-family alignment bonus
  eligibilityPenalty: -15, // unchanged
} as const;

// ---------------------------------------------------------------------------
// Degree-subject → role-family affinity map (NEEDS-JUDGMENT — local constant,
// never imported from constants.ts which is tracker-owned).
//
// Design choices and uncertainty notes:
//  • "Mathematics", "Statistics", "Physics" → QUANT + MARKETS: well-established
//    pipeline into systematic / quant trading; low uncertainty.
//  • "Computer Science", "Engineering" → QUANT: quant firms recruit CS/Eng
//    heavily; lower certainty for non-quant roles so limited to QUANT here.
//  • "Economics", "Finance", "Accounting" → IB + ASSET_MGMT + CORP_BANKING +
//    RESEARCH: the canonical pipeline; low uncertainty.
//  • "Economics" → MARKETS: Sales & Trading recruits economists heavily; moderate
//    certainty.
//  • "Law" → IB: M&A / capital markets have a secondary law pipeline; moderate
//    uncertainty — kept but worth user review.
//  • PRIVATE_EQUITY and HEDGE_FUND overlap significantly with IB/ASSET_MGMT
//    pipelines; same degree groups apply; mapped accordingly.
//  • Subjects NOT listed (e.g. History, Art History, Classics, Drama, Sociology)
//    → NO affinity (0 points). This is deliberate: not penalised, just neutral.
//    Some recruiters value these for IB (writing ability) but the signal is too
//    weak to map deterministically — flag for user review if desired.
// ---------------------------------------------------------------------------

// Normalise a raw degree subject string for map lookup.
function normDegree(s: string): string {
  return s.trim().toLowerCase();
}

// Map from normalised-subject keywords → RoleFamilies that benefit.
// Lookup is substring-based: if any key appears in the normalised subject string,
// those families receive the degreeAffinity bonus.
const DEGREE_AFFINITY_MAP: Array<{ keywords: string[]; families: RoleFamily[] }> = [
  {
    // Pure maths / statistics / physics → quant and markets
    keywords: ["mathematics", "maths", "statistics", "statistical", "physics"],
    families: ["QUANT", "MARKETS", "RESEARCH"],
  },
  {
    // Computer science / software engineering / data science → quant
    keywords: ["computer science", "computing", "software engineering", "data science", "machine learning", "artificial intelligence"],
    families: ["QUANT"],
  },
  {
    // Engineering (non-software) → quant (secondary pipeline)
    keywords: ["engineering", "electrical", "mechanical", "chemical engineering"],
    families: ["QUANT"],
  },
  {
    // Economics → broad finance pipeline (IB, Markets, AM, CB, Research)
    keywords: ["economics", "econometrics"],
    families: ["IB", "MARKETS", "ASSET_MGMT", "CORP_BANKING", "RESEARCH"],
  },
  {
    // Finance / accounting → IB, AM, CB
    keywords: ["finance", "accounting", "accountancy", "financial mathematics", "financial engineering"],
    families: ["IB", "ASSET_MGMT", "CORP_BANKING", "PRIVATE_EQUITY", "HEDGE_FUND"],
  },
  {
    // Business / management → IB, CB, AM (weaker signal; included but borderline)
    keywords: ["business", "management", "commerce"],
    families: ["IB", "CORP_BANKING", "ASSET_MGMT"],
  },
  {
    // Law → IB (M&A / capital markets secondary pipeline)
    keywords: ["law", "legal"],
    families: ["IB"],
  },
];

/**
 * Returns the degree-affinity bonus (WEIGHTS.degreeAffinity or 0).
 * Neutral (0) for empty/unknown subject. No negative score possible.
 */
function degreeAffinityScore(
  degreeSubject: string | undefined | null,
  oppRoleFamily: RoleFamily,
): number {
  if (!degreeSubject) return 0;
  const norm = normDegree(degreeSubject);
  if (!norm) return 0;

  for (const entry of DEGREE_AFFINITY_MAP) {
    if (entry.keywords.some((kw) => norm.includes(kw))) {
      if (entry.families.includes(oppRoleFamily)) {
        return WEIGHTS.degreeAffinity;
      }
    }
  }
  return 0;
}

export interface ScoreProfile {
  workAuth: WorkAuth | null;
  graduationYear: number;
  currentYear: number;
  skills: string[];
  /** Field of study (e.g. "Mathematics", "Economics"). Optional — null/empty → neutral. */
  degreeSubject?: string | null;
}

export interface ScorePreferences {
  targetRoleFamilies: RoleFamily[];
  preferredLocations: string[];
  openToAnywhereUk: boolean;
  targetEmployers: string[];
}

export interface ScoreOpportunity {
  roleFamily: RoleFamily;
  location: string;
  employerName: string;
  sponsorshipInfo?: string | null;
  eligibilityNotes?: string | null;
  tags: string[];
  title: string;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Normalise a skill or opportunity text fragment for phrase matching.
 *
 * Rules:
 *  - lowercase + trim  (covers case-insensitivity)
 *  - hyphens and ampersands → space  (so "data-analysis" ≡ "data analysis",
 *    and "M&A" ≡ "m a" which is the same tokens as the tag "m&a")
 *  - collapse multiple spaces into one
 *
 * This normalisation is applied consistently to both the student skill strings
 * and the opportunity corpus (tags + title), so matching is symmetric.
 */
function normSkill(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Return true if the normalised skill phrase appears in the normalised corpus
 * on word boundaries.  Word boundaries use `\b` for alphanumeric characters;
 * for skills/corpus that consist entirely of word characters (after normSkill)
 * this is sufficient.  A skill like "m&a" normalises to "m a" and is matched
 * as two separate words "m" then "a" — but the corpus "m&a" also normalises
 * to "m a", so they align correctly.
 *
 * False-positive safety:
 *  - "java" won't match "javascript" because \b prevents partial-word hits.
 *  - "r" won't match "research" for the same reason.
 *  - "mna" won't match "m&a" because "m&a"→"m a" and "mna"→"mna" diverge.
 */
function skillMatchesCorpus(normalisedSkill: string, normalisedCorpus: string): boolean {
  if (!normalisedSkill) return false;
  // Escape any regex-special characters in the skill (e.g. parentheses).
  const escaped = normalisedSkill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // \b works at word-character (\w) boundaries; spaces in a multi-word skill
  // are already literal spaces in the corpus, so the pattern reads naturally.
  const pattern = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i");
  return pattern.test(normalisedCorpus);
}

const NO_SPONSORSHIP_PATTERNS = [
  "no sponsorship",
  "no visa sponsorship",
  "without sponsorship",
  "cannot sponsor",
  "cannot offer visa",
  "cannot offer sponsorship",
  "not able to sponsor",
  "unable to sponsor",
  "does not sponsor",
  "do not sponsor",
  "won't sponsor",
  "will not sponsor",
  "must have the right to work",
  "right to work in the uk",
];

function mentionsNoSponsorship(text?: string | null): boolean {
  if (!text) return false;
  const t = norm(text);
  return NO_SPONSORSHIP_PATTERNS.some((p) => t.includes(p));
}

function offersSponsorship(text?: string | null): boolean {
  if (!text) return false;
  const t = norm(text);
  return (
    t.includes("sponsorship available") ||
    t.includes("visa sponsorship") ||
    t.includes("will sponsor") ||
    t.includes("sponsors visas") ||
    t.includes("offers sponsorship")
  );
}

export function scoreOpportunity(
  profile: ScoreProfile,
  prefs: ScorePreferences,
  opp: ScoreOpportunity,
  cycleSummerYear: number = INTERNSHIP_CYCLE_SUMMER_YEAR,
): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  // 1. Role family match -----------------------------------------------------
  if (prefs.targetRoleFamilies.includes(opp.roleFamily)) {
    score += WEIGHTS.roleFamily;
    reasons.push(`Matches your interest in ${ROLE_FAMILY_LABEL[opp.roleFamily]}`);
  }

  // 2. Timing (penultimate-year heuristic) -----------------------------------
  const idealGradYear = cycleSummerYear + 1;
  if (profile.graduationYear === idealGradYear) {
    score += WEIGHTS.timing;
    reasons.push(
      `Graduating ${profile.graduationYear} fits the penultimate-year summer cycle`,
    );
  } else if (
    profile.graduationYear === cycleSummerYear ||
    profile.graduationYear === cycleSummerYear + 2
  ) {
    score += Math.round(WEIGHTS.timing * 0.6);
    reasons.push(`Graduating ${profile.graduationYear} is close to the typical cycle`);
  }

  // 3. Location --------------------------------------------------------------
  const preferred = prefs.preferredLocations.map(norm);
  if (preferred.includes(norm(opp.location))) {
    score += WEIGHTS.locationExact;
    reasons.push(`${opp.location} is one of your preferred locations`);
  } else if (prefs.openToAnywhereUk) {
    score += WEIGHTS.locationAnywhere;
    reasons.push(`You're open to roles anywhere in the UK`);
  }

  // 4. Work authorization ----------------------------------------------------
  // workAuth is optional post-onboarding; unknown → no bonus and no penalty,
  // so ranking is unaffected until the user answers.
  if (profile.workAuth !== null) {
    const visaRequired = profile.workAuth === "UK_VISA_REQUIRED";
    const explicitlyNoSponsorship =
      mentionsNoSponsorship(opp.sponsorshipInfo) ||
      mentionsNoSponsorship(opp.eligibilityNotes);

    if (!visaRequired) {
      score += WEIGHTS.workAuth;
      reasons.push("You're eligible to work in the UK without sponsorship");
    } else if (explicitlyNoSponsorship) {
      score += WEIGHTS.eligibilityPenalty;
      reasons.push("⚠ This employer states it cannot offer visa sponsorship");
    } else if (offersSponsorship(opp.sponsorshipInfo)) {
      score += WEIGHTS.workAuth;
      reasons.push("Employer indicates visa sponsorship is available");
    } else {
      score += WEIGHTS.workAuthVisaUnknown;
      reasons.push("Sponsorship not stated — worth confirming before applying");
    }
  }

  // 5. Target employer shortlist ---------------------------------------------
  if (prefs.targetEmployers.map(norm).includes(norm(opp.employerName))) {
    score += WEIGHTS.employer;
    reasons.push(`${opp.employerName} is on your target employer list`);
  }

  // 6. Skill / tag overlap ---------------------------------------------------
  //
  // Build a single normalised corpus from the opportunity's tags and title.
  // Tags may be multi-word phrases ("financial modelling") and the title is
  // free-form text.  We join them with spaces so a phrase search works across
  // both without needing separate Set membership checks.
  //
  // NOTE: descriptionSummary is deliberately excluded.  It is long, unstructured
  // text where a naive phrase search risks false positives (e.g. "python" in a
  // sentence about "Python scripting is not required").  Tags+title are
  // curated/structured and safe for phrase matching.
  const corpusRaw = [...opp.tags, opp.title].join(" ");
  const corpus = normSkill(corpusRaw);

  const matchedSkills = profile.skills
    .map(norm) // keep display form (lowercase, trimmed)
    .filter((s) => {
      if (!s) return false;
      return skillMatchesCorpus(normSkill(s), corpus);
    });
  if (matchedSkills.length > 0) {
    score += WEIGHTS.skills;
    reasons.push(`Your skills overlap (${matchedSkills.slice(0, 3).join(", ")})`);
  }

  // 7. Degree-subject affinity -----------------------------------------------
  // Neutral for empty/unknown degreeSubject — no bonus, no penalty.
  const affinityBonus = degreeAffinityScore(profile.degreeSubject, opp.roleFamily);
  if (affinityBonus > 0) {
    score += affinityBonus;
    reasons.push(
      `Your degree in ${profile.degreeSubject} aligns well with ${ROLE_FAMILY_LABEL[opp.roleFamily]} roles`,
    );
  }

  return { score: clamp(score, 0, 100), reasons };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export type FitTier = "strong" | "good" | "moderate" | "low";

export function fitTier(score: number): FitTier {
  if (score >= 75) return "strong";
  if (score >= 55) return "good";
  if (score >= 35) return "moderate";
  return "low";
}

export function fitTierLabel(score: number): string {
  switch (fitTier(score)) {
    case "strong":
      return "Strong fit";
    case "good":
      return "Good fit";
    case "moderate":
      return "Moderate fit";
    default:
      return "Low fit";
  }
}
