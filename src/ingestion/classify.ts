import type { RoleFamily } from "@prisma/client";

/**
 * Pure classification of a raw ATS posting into "UK finance summer internship
 * we should publish" or an exclusion reason. Shared by every live adapter
 * (Greenhouse / Lever / Ashby) so the inclusion rules live in one tested
 * place. Deterministic, keyword-based — same philosophy as lib/scoring.
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
  | "wrong-season"
  | "not-uk"
  | "not-finance";

export type Classification =
  | { include: true; roleFamily: RoleFamily; via: "keyword" | "fallback" }
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

// Programmes that are early-careers but NOT a summer internship. "intern" in
// the title does not rescue these — "Off-cycle Intern" is still out of scope.
const NON_SUMMER_SIGNALS = [
  "off-cycle",
  "off cycle",
  "spring",
  "insight",
  "winter",
  "apprentice",
  "industrial placement",
  "placement year",
];

// Roles that are not internships at all.
const NON_INTERN_SIGNALS = [
  /\bgraduate\b/i,
  /\bnew grad\b/i,
  /\bacademy\b/i,
  /\bfull[- ]time\b/i,
];

function isInternship(p: RawPosting): boolean {
  const title = p.title;
  const byTitle = INTERN_TITLE_SIGNALS.some((s) => s.test(title));
  const byType = /\bintern(ship)?s?\b/i.test(p.employmentType ?? "");
  if (!byTitle && !byType) return false;
  // A title signal like "Graduate Software Intern" is contradictory; treat
  // explicit non-intern words in the TITLE as authoritative.
  return !NON_INTERN_SIGNALS.some((s) => s.test(title));
}

function isWrongSeason(p: RawPosting): boolean {
  const title = norm(p.title);
  return NON_SUMMER_SIGNALS.some((s) => title.includes(s));
}

// ---------------------------------------------------------------------------
// UK location detection
// ---------------------------------------------------------------------------

const UK_LOCATION_SIGNALS = [
  "london",
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
  if (isWrongSeason(p)) return { include: false, reason: "wrong-season" };
  if (!isInternship(p)) return { include: false, reason: "not-internship" };
  if (!isUkLocation(p.location)) return { include: false, reason: "not-uk" };

  const titleAndDepts = ` ${norm(p.title)} ${(p.departments ?? [])
    .map(norm)
    .join(" ")} `;
  if (NON_FINANCE_SIGNALS.some((s) => titleAndDepts.includes(s)))
    return { include: false, reason: "not-finance" };

  const inferred = inferRoleFamily(p);
  if (inferred) return { include: true, roleFamily: inferred, via: "keyword" };
  if (fallbackRoleFamily)
    return { include: true, roleFamily: fallbackRoleFamily, via: "fallback" };
  return { include: false, reason: "not-finance" };
}
