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

export type ExcludeReason = "not-internship" | "not-finance" | "not-uk";

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
// LOCKED precedence (ADR-003 §2.1, SPEC-CHECK §8.1): most specific first —
//   SPRING_WEEK → INDUSTRIAL_PLACEMENT → OFF_CYCLE → SUMMER_INTERNSHIP (default)
// Winter folds into OFF_CYCLE (no separate WINTER value). A title naming
// multiple seasons (e.g. "Summer Industrial Placement") resolves to the most
// specific match by this order, NOT the first word in the string.
// ---------------------------------------------------------------------------

const SPRING_WEEK_SIGNALS = [
  "spring week",
  "spring insight",
  "spring into",
  "spring programme",
  "spring program",
  "insight day",
  "insight week",
  "insight programme",
  "insight program",
  "insight series",
  "discovery day",
  "discovery week",
  "discovery programme",
  "discovery program",
  "first-year insight",
  "first year insight",
  "sophomore",
];

const INDUSTRIAL_PLACEMENT_SIGNALS = [
  "industrial placement",
  "placement year",
  "year in industry",
  "sandwich placement",
  "12-month placement",
  "12 month placement",
  "12-month industrial",
  "apprentice",
  "apprenticeship",
];

// Off-cycle proper, plus winter (folded here per ADR-003).
const OFF_CYCLE_SIGNALS = ["off-cycle", "off cycle", "winter"];

export function detectProgrammeType(p: RawPosting): ProgrammeType {
  const title = norm(p.title);
  if (SPRING_WEEK_SIGNALS.some((s) => title.includes(s))) return "SPRING_WEEK";
  if (INDUSTRIAL_PLACEMENT_SIGNALS.some((s) => title.includes(s)))
    return "INDUSTRIAL_PLACEMENT";
  if (OFF_CYCLE_SIGNALS.some((s) => title.includes(s))) return "OFF_CYCLE";
  return "SUMMER_INTERNSHIP";
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
