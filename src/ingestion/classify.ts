import type { RoleFamily } from "@prisma/client";
import type { ProgrammeType } from "@/lib/constants";

/**
 * Pure classification of a raw ATS posting into "a UK finance internship we
 * should publish" (tagged with its programme season) or an exclusion reason.
 * Shared by every live adapter (Greenhouse / Lever / Ashby / …) so the rules
 * live in one tested place. Deterministic, keyword-based — same philosophy as
 * lib/scoring.
 *
 * The tracker is UK-only (ADR-005): a posting whose location is NOT UK is
 * EXCLUDED (`not-uk`). Programme SEASON, however, is CLASSIFIED not gatekept —
 * a Spring Week, off-cycle or placement UK role is included and tagged rather
 * than discarded (the ADR-003 bug fix, retained). Retained exclusions are
 * `not-internship`, `not-finance` and `not-uk`.
 */

export interface RawPosting {
  title: string;
  /** Free-text location string as the ATS reports it, e.g. "London, UK". */
  location: string;
  /** Department / team labels, when the ATS exposes them. */
  departments?: string[];
  /** ATS commitment/employment-type label, e.g. "Intern", "Full-time". */
  employmentType?: string | null;
  /** Plain-text description. Used ONLY for classification — never published. */
  descriptionText?: string | null;
}

export type ExcludeReason =
  | "not-internship"
  | "not-finance"
  | "not-uk"
  | "pre-university";

export type Classification =
  | {
      include: true;
      roleFamily: RoleFamily;
      via: "keyword" | "fallback";
      programmeType: ProgrammeType;
    }
  | { include: false; reason: ExcludeReason };

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

// ---------------------------------------------------------------------------
// Internship + season detection
// ---------------------------------------------------------------------------

// Word-boundary regexes: "International Tax Manager" must NOT read as intern,
// and "Undergraduate" must not trip the "graduate" exclusion below.
const INTERN_TITLE_SIGNALS = [
  /\bintern(ship)?s?\b/i,
  /\bsummer analyst\b/i,
  /\bsummer associate\b/i,
];

// Roles that are not internships at all.
const NON_INTERN_SIGNALS = [
  /\bgraduate\b/i,
  /\bnew grad\b/i,
  /\bacademy\b/i,
  /\bfull[- ]time\b/i,
];

/**
 * Is this an in-scope early-careers programme (internship, OR a Spring Week /
 * insight / off-cycle / placement)? Spring Weeks and insight programmes often
 * carry NO "intern" word in the title, so a recognised non-summer programme
 * signal (see detectProgrammeType) also qualifies — otherwise AC1/AC3 ("Spring
 * Insight Week", "Industrial Placement") would be dropped as not-internship.
 * The graduate/full-time exclusion in NON_INTERN_SIGNALS stays authoritative:
 * a "Graduate Programme" is still out of scope.
 */
function isInternship(p: RawPosting): boolean {
  const title = p.title;
  if (NON_INTERN_SIGNALS.some((s) => s.test(title))) return false;
  const byTitle = INTERN_TITLE_SIGNALS.some((s) => s.test(title));
  const byType = /\bintern(ship)?s?\b/i.test(p.employmentType ?? "");
  // A recognised non-summer programme word (spring/insight/placement/off-cycle/
  // winter) marks an in-scope early-careers programme even without "intern".
  const byProgramme = detectProgrammeType(p) !== "SUMMER_INTERNSHIP";
  return byTitle || byType || byProgramme;
}

// ---------------------------------------------------------------------------
// Programme-type (season) detection
//
// Precedence (ADR-005, researched UK taxonomy — uk-programme-taxonomy.md
// §"Precedence rule"). CHANGED from the ADR-003 SPRING-first order: industrial
// placement is the most specific, rarely-wrong UK signal ("industrial
// placement" essentially never means a spring week or summer internship), so it
// now wins outright — this also resolves the genuine 12-month OFF_CYCLE vs
// INDUSTRIAL_PLACEMENT overlap (placement vocabulary wins).
//
//   INDUSTRIAL_PLACEMENT → SPRING_WEEK → OFF_CYCLE → SUMMER_INTERNSHIP (default)
//
// First-match wins; all matching is WORD-BOUNDARY regex (preserves the existing
// guardrail so "Spring 2027" start dates and "Ukraine"-style strings don't
// false-hit). Winter folds into OFF_CYCLE (no separate WINTER value).
// ---------------------------------------------------------------------------

// Bucket 4 — INDUSTRIAL_PLACEMENT. The word "placement" is OVERLOADED in the UK
// ("work placement", "trading floor placement", a 6-week summer placement), so
// we require a year/sandwich/industrial qualifier — bare "placement" alone is
// NOT industrial placement (research edge case 5).
const INDUSTRIAL_PLACEMENT_SIGNALS: RegExp[] = [
  /\bindustrial placement\b/i,
  /\bplacement year\b/i,
  /\byear[- ]in[- ]industry\b/i,
  /\bsandwich (placement|year|course)\b/i,
  /\bsandwich\b/i,
  /\bindustrial year\b/i,
  /\bindustrial trainee\b/i,
  // "12-month" ONLY when paired with a placement/industrial context.
  /\b12[- ]month\b[\s\S]*\b(placement|industrial)\b/i,
  /\b(placement|industrial)\b[\s\S]*\b12[- ]month\b/i,
];

// Bucket 1 — SPRING_WEEK (first-year / early insight). GUARD: bare "spring" is
// SPRING_WEEK ONLY when paired with an insight/week/first-year/"spring into"
// token — a bare "Spring 2027" start date must NOT be spring week (edge case 1).
const SPRING_WEEK_SIGNALS: RegExp[] = [
  /\bspring week\b/i,
  /\bspring insight\b/i,
  /\bspring into\b/i,
  /\binsight day\b/i,
  /\binsight week\b/i,
  /\binsight evening\b/i,
  /\binsight programme\b/i,
  /\binsight program\b/i,
  /\binsight series\b/i,
  /\bearly insight\b/i,
  /\bfirst[- ]year\b/i,
  /\b1st year\b/i,
  /\bsophomore\b/i,
  /\bdiscovery\b/i,
  /\bexplore\b/i,
  /\bspotlight\b/i,
  /\bimmersion\b/i,
  /\bhorizons?\b/i,
  // Diversity-insight variants (medium-confidence; insight/early-careers context).
  /\bwomen'?s insight\b/i,
  /\bdiversity insight\b/i,
  /\bblack heritage\b/i,
  /\bsocial mobility\b/i,
  // Bare "spring" only when paired with an insight/week/first-year token.
  /\bspring\b[\s\S]*\b(insight|week|first[- ]year|1st year)\b/i,
  /\b(insight|week|first[- ]year|1st year)\b[\s\S]*\bspring\b/i,
];

// Bucket 3 — OFF_CYCLE (off-cycle; winter folds here). 3-/6-month internships,
// rolling / quarterly intakes.
const OFF_CYCLE_SIGNALS: RegExp[] = [
  /\boff[- ]?cycle\b/i,
  /\bwinter internship\b/i,
  /\bwinter intern\b/i,
  /\bwinter\b/i,
  /\b[36][- ]month\b/i,
  /\brolling\b/i,
  /\bquarterly intake\b/i,
];

export function detectProgrammeType(p: RawPosting): ProgrammeType {
  const title = p.title;
  if (INDUSTRIAL_PLACEMENT_SIGNALS.some((s) => s.test(title)))
    return "INDUSTRIAL_PLACEMENT";
  if (SPRING_WEEK_SIGNALS.some((s) => s.test(title))) return "SPRING_WEEK";
  if (OFF_CYCLE_SIGNALS.some((s) => s.test(title))) return "OFF_CYCLE";
  return "SUMMER_INTERNSHIP";
}

// ---------------------------------------------------------------------------
// Pre-University / school-leaver guard (research edge case 10)
//
// the-trackr has a separate Pre-University tab; we have NO bucket for it. These
// programmes carry insight/spring language and would leak into SPRING_WEEK, so
// the guard MUST run BEFORE programme-type assignment in classifyPosting. A
// "Spring Insight for Year 12 students" is EXCLUDED, not tagged SPRING_WEEK.
// Title-scoped (consistent with the graduate exclusion).
// ---------------------------------------------------------------------------

const PRE_UNIVERSITY_SIGNALS: RegExp[] = [
  /\bschool[- ]leavers?\b/i,
  /\byear 1[23]\b/i,
  /\bsixth form\b/i,
  /\ba[- ]levels?\b/i,
  /\bgcses?\b/i,
  /\bpre[- ]universit(y|ies)\b/i,
  /\bpre[- ]uni\b/i,
  /\baged 1[67]\b/i,
];

function isPreUniversity(p: RawPosting): boolean {
  return PRE_UNIVERSITY_SIGNALS.some((s) => s.test(p.title));
}

// ---------------------------------------------------------------------------
// Off-cycle return-offer / FT-conversion guard (research edge case 3)
//
// "Off-cycle analyst — full-time" can be a permanent hire, not an internship.
// If off-cycle co-occurs with full-time/permanent and there is NO intern token,
// it is a full-time role → excluded. An off-cycle INTERNSHIP (has `intern`)
// stays in scope and classifies as OFF_CYCLE.
// ---------------------------------------------------------------------------

const OFF_CYCLE_TOKEN = /\boff[- ]?cycle\b/i;
const FULL_TIME_OR_PERMANENT = /\b(full[- ]time|permanent)\b/i;
const INTERN_TOKEN = /\bintern(ship)?s?\b/i;

function isOffCycleFullTimeConversion(p: RawPosting): boolean {
  return (
    OFF_CYCLE_TOKEN.test(p.title) &&
    FULL_TIME_OR_PERMANENT.test(p.title) &&
    !INTERN_TOKEN.test(p.title)
  );
}

// ---------------------------------------------------------------------------
// UK location detection
// ---------------------------------------------------------------------------

const UK_LOCATION_SIGNALS = [
  "london",
  "canary wharf",
  "united kingdom",
  "england",
  "scotland",
  "wales",
  "northern ireland",
  "edinburgh",
  "manchester",
  "birmingham",
  "leeds",
  "glasgow",
  "bristol",
  "belfast",
  "cambridge",
  "oxford",
];

/** Matches "UK" / "GB" as words (avoids "Ukraine"); case-insensitive. "GB" is
 *  the ISO country code structured-data feeds (JSON-LD JobPosting) report. */
const UK_WORD = /\b(uk|gb|gbr)\b/i;

export function isUkLocation(location: string): boolean {
  const loc = norm(location);
  if (UK_LOCATION_SIGNALS.some((s) => loc.includes(s))) return true;
  return UK_WORD.test(location);
}

// ---------------------------------------------------------------------------
// Role-family inference
// ---------------------------------------------------------------------------

// Checked in order — most specific first. "Quantitative Trading" must land on
// QUANT before "trading" pulls it into MARKETS; generic tech keywords come
// last so "Technology Analyst, Investment Banking" lands on IB.
const ROLE_FAMILY_RULES: [RoleFamily, string[]][] = [
  ["QUANT", ["quantitative", "quant ", "systematic", "machine learning"]],
  [
    "IB",
    ["investment banking", "m&a", "mergers", "corporate finance", "advisory"],
  ],
  [
    "MARKETS",
    [
      "sales & trading",
      "sales and trading",
      "global markets",
      "trading",
      "trader",
      "structuring",
      "fixed income",
      "equities",
      "commodities",
    ],
  ],
  [
    "PRIVATE_EQUITY",
    ["private equity", "private credit", "private markets", "buyout"],
  ],
  [
    "ASSET_MGMT",
    [
      "asset management",
      "investment management",
      "portfolio",
      "wealth management",
      "fund management",
    ],
  ],
  [
    "CORP_BANKING",
    ["corporate banking", "transaction banking", "capital markets", "treasury"],
  ],
  [
    "RESEARCH",
    ["equity research", "macro research", "credit research", "research analyst"],
  ],
  ["HEDGE_FUND", ["hedge fund", "investment analyst", "investment team"]],
  // Tech-at-a-finance-firm reads as quant/systematic in this product's taxonomy.
  [
    "QUANT",
    ["software", "technology", "engineer", "developer", "data scien"],
  ],
];

// Functions we never publish even at a finance firm — a People Ops intern at a
// hedge fund is not in scope.
const NON_FINANCE_SIGNALS = [
  "people operations",
  "human resources",
  " hr ",
  "talent acquisition",
  "recruit",
  "marketing",
  "communications",
  "legal",
  "office manager",
  "facilities",
  "design",
  "workplace",
];

export function inferRoleFamily(p: RawPosting): RoleFamily | null {
  // Title and departments are strong signals; description is a weak tiebreak,
  // so it is only consulted when the strong text yields nothing.
  const strong = ` ${norm(p.title)} ${(p.departments ?? []).map(norm).join(" ")} `;
  for (const [family, keywords] of ROLE_FAMILY_RULES) {
    if (keywords.some((k) => strong.includes(k))) return family;
  }
  const weak = ` ${norm(p.descriptionText).slice(0, 2000)} `;
  for (const [family, keywords] of ROLE_FAMILY_RULES) {
    if (keywords.some((k) => weak.includes(k))) return family;
  }
  return null;
}

/** Map an employer's free-text sector to a default role family, so generic
 *  titles ("Summer Intern 2027") at a known hedge fund still classify. */
export function roleFamilyFromSector(
  sector: string | null | undefined,
): RoleFamily | null {
  const s = norm(sector);
  if (!s) return null;
  if (s.includes("hedge")) return "HEDGE_FUND";
  if (s.includes("private equity") || s.includes("private credit"))
    return "PRIVATE_EQUITY";
  if (s.includes("asset") || s.includes("investment management"))
    return "ASSET_MGMT";
  if (s.includes("market maker") || s.includes("proprietary trading"))
    return "QUANT";
  if (s.includes("advisory")) return "IB";
  if (s.includes("bank")) return "IB";
  return null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function classifyPosting(
  p: RawPosting,
  fallbackRoleFamily: RoleFamily | null = null,
): Classification {
  // Pre-University / school-leaver (research edge case 10): these carry
  // insight/spring language and would otherwise leak into SPRING_WEEK, so the
  // guard runs FIRST, before any programme-type assignment. We have no bucket
  // for them (the-trackr has a separate Pre-University tab).
  if (isPreUniversity(p)) return { include: false, reason: "pre-university" };

  // Off-cycle return-offer / FT conversion (research edge case 3): off-cycle +
  // full-time/permanent with NO intern token is a permanent role, not an
  // internship. (The generic full-time exclusion in isInternship also catches
  // the "full-time" variant; this additionally catches the "permanent" one.)
  if (isOffCycleFullTimeConversion(p))
    return { include: false, reason: "not-internship" };

  // UK-only gate (ADR-005): a posting located outside the UK is excluded. The
  // programme SEASON, by contrast, is CLASSIFIED not gatekept (ADR-003 bug fix
  // retained) — a Spring Week / off-cycle / placement UK role is tagged, not
  // discarded.
  if (!isInternship(p)) return { include: false, reason: "not-internship" };
  if (!isUkLocation(p.location)) return { include: false, reason: "not-uk" };

  const titleAndDepts = ` ${norm(p.title)} ${(p.departments ?? [])
    .map(norm)
    .join(" ")} `;
  if (NON_FINANCE_SIGNALS.some((s) => titleAndDepts.includes(s)))
    return { include: false, reason: "not-finance" };

  const programmeType = detectProgrammeType(p);

  const inferred = inferRoleFamily(p);
  if (inferred)
    return {
      include: true,
      roleFamily: inferred,
      via: "keyword",
      programmeType,
    };
  if (fallbackRoleFamily)
    return {
      include: true,
      roleFamily: fallbackRoleFamily,
      via: "fallback",
      programmeType,
    };
  return { include: false, reason: "not-finance" };
}
