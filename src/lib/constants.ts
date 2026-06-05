import type {
  RoleFamily,
  OpportunityStatus,
  WorkAuth,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Role families
// ---------------------------------------------------------------------------

export const ROLE_FAMILIES: { value: RoleFamily; label: string; short: string }[] =
  [
    { value: "IB", label: "Investment Banking", short: "IB" },
    { value: "MARKETS", label: "Sales & Trading / Markets", short: "Markets" },
    { value: "ASSET_MGMT", label: "Asset / Investment Management", short: "AM" },
    { value: "PRIVATE_EQUITY", label: "Private Equity / Credit", short: "PE" },
    { value: "HEDGE_FUND", label: "Hedge Fund / Buy-side", short: "HF" },
    { value: "QUANT", label: "Quant / Systematic", short: "Quant" },
    { value: "CORP_BANKING", label: "Corporate Banking / Capital Markets", short: "CB" },
    { value: "RESEARCH", label: "Research", short: "Research" },
  ];

export const ROLE_FAMILY_LABEL: Record<RoleFamily, string> = Object.fromEntries(
  ROLE_FAMILIES.map((r) => [r.value, r.label]),
) as Record<RoleFamily, string>;

export const ROLE_FAMILY_SHORT: Record<RoleFamily, string> = Object.fromEntries(
  ROLE_FAMILIES.map((r) => [r.value, r.short]),
) as Record<RoleFamily, string>;

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  OPEN: "Open",
  OPENING_SOON: "Opening soon",
  CLOSED: "Closed",
  UNKNOWN: "Unknown",
};

export const STATUS_OPTIONS: { value: OpportunityStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "OPENING_SOON", label: "Opening soon" },
  { value: "CLOSED", label: "Closed" },
  { value: "UNKNOWN", label: "Unknown" },
];

// ---------------------------------------------------------------------------
// Work authorization
// ---------------------------------------------------------------------------

export const WORK_AUTH_OPTIONS: { value: WorkAuth; label: string }[] = [
  { value: "UK_CITIZEN", label: "UK citizen" },
  { value: "UK_SETTLED", label: "Settled / pre-settled / ILR" },
  { value: "UK_VISA_REQUIRED", label: "Will need visa sponsorship" },
  { value: "OTHER", label: "Other / not sure" },
];

export const WORK_AUTH_LABEL: Record<WorkAuth, string> = Object.fromEntries(
  WORK_AUTH_OPTIONS.map((o) => [o.value, o.label]),
) as Record<WorkAuth, string>;

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

export const DEGREE_TYPES = [
  "BA",
  "BSc",
  "BEng",
  "MA",
  "MSc",
  "MEng",
  "MPhil",
  "PhD",
  "Other",
] as const;

// A pragmatic list of UK universities students in our target audience attend.
// Free-text is also allowed in onboarding, so this is a convenience list.
export const UK_UNIVERSITIES = [
  "University of Cambridge",
  "University of Oxford",
  "London School of Economics",
  "Imperial College London",
  "University College London",
  "University of Warwick",
  "University of Bristol",
  "University of Edinburgh",
  "University of Manchester",
  "King's College London",
  "Durham University",
  "University of Nottingham",
  "University of Bath",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// Locations (UK finance hubs)
// ---------------------------------------------------------------------------

export const UK_LOCATIONS = [
  "London",
  "Edinburgh",
  "Birmingham",
  "Manchester",
  "Leeds",
  "Glasgow",
  "Bristol",
  "Belfast",
] as const;

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export const SORT_OPTIONS = [
  { value: "best_match", label: "Best match for you" },
  { value: "recently_seen", label: "Most recently seen" },
  { value: "opens", label: "Opening date" },
  { value: "deadline", label: "Application deadline" },
  { value: "employer", label: "Employer (A–Z)" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

export const DEFAULT_SORT: SortKey = "best_match";
