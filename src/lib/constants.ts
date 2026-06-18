import type {
  RoleFamily,
  OpportunityStatus,
  WorkAuth,
  ApplicationStatus,
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
// Programme type (season) taxonomy
//
// Hand-written string-literal union kept deliberately INDEPENDENT of the
// Prisma-generated enum so all consuming logic stays DB-independent (the
// Prisma enum in schema.prisma is the persisted mirror and MUST use the same
// spelling). Mirrors the ROLE_FAMILIES option-list / label-map shape so the
// tracker filters + UI consume them the same way.
//
// The tracker is UK-only (ADR-005); region was removed. ADR-006 narrows the
// tracked scope to the 3 core competitive finance internship seasons — Spring
// Week / Summer / Off-Cycle. Industrial placements (plus pre-university and
// apprenticeships) are EXCLUDED upstream in classify.ts, "for now".
// ---------------------------------------------------------------------------

export type ProgrammeType = "SPRING_WEEK" | "SUMMER_INTERNSHIP" | "OFF_CYCLE";

export const PROGRAMME_TYPES: { value: ProgrammeType; label: string }[] = [
  { value: "SPRING_WEEK", label: "Spring Week" },
  { value: "SUMMER_INTERNSHIP", label: "Summer Internship" },
  { value: "OFF_CYCLE", label: "Off-Cycle" },
];

export const PROGRAMME_TYPE_LABELS: Record<ProgrammeType, string> =
  Object.fromEntries(
    PROGRAMME_TYPES.map((p) => [p.value, p.label]),
  ) as Record<ProgrammeType, string>;

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
// Application pipeline (real applications to external roles)
// ---------------------------------------------------------------------------

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "DRAFT",
  "AUTOFILLED",
  "SUBMITTED",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  AUTOFILLED: "Autofilled",
  SUBMITTED: "Submitted",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

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
