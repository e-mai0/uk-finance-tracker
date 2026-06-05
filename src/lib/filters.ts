import type { OpportunityStatus, RoleFamily } from "@prisma/client";
import { ROLE_FAMILY_LABEL, type SortKey, DEFAULT_SORT } from "./constants";

/**
 * A flattened, UI-ready view of an opportunity used by the tracker table,
 * the filter/sort helpers, and the unit tests. Dates may arrive as `Date`
 * (from Prisma) or ISO strings (from serialized props), so helpers normalize.
 */
export interface TrackerItem {
  id: string;
  employerName: string;
  employerSlug: string;
  logoHint?: string | null;
  title: string;
  roleFamily: RoleFamily;
  divisionDesk?: string | null;
  location: string;
  status: OpportunityStatus;
  opensAt?: Date | string | null;
  deadlineAt?: Date | string | null;
  lastSeenAt: Date | string;
  firstSeenAt: Date | string;
  applicationUrl?: string | null;
  sponsorshipInfo?: string | null;
  tags: string[];
  score?: number;
  saved?: boolean;
}

export interface FilterParams {
  search: string;
  status: OpportunityStatus[];
  location: string[];
  roleFamily: RoleFamily[];
  hasDeadline: boolean;
  sponsorshipAvailable: boolean;
  sort: SortKey;
}

export const EMPTY_FILTERS: FilterParams = {
  search: "",
  status: [],
  location: [],
  roleFamily: [],
  hasDeadline: false,
  sponsorshipAvailable: false,
  sort: DEFAULT_SORT,
};

// ---------------------------------------------------------------------------
// Parsing URL search params into a normalized FilterParams object.
// ---------------------------------------------------------------------------

type RawParams = Record<string, string | string[] | undefined>;

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap((x) => x.split(",")).filter(Boolean);
  return v.split(",").filter(Boolean);
}

const VALID_SORTS: SortKey[] = [
  "best_match",
  "recently_seen",
  "opens",
  "deadline",
  "employer",
];

export function parseFilters(params: RawParams): FilterParams {
  const sortRaw = (Array.isArray(params.sort) ? params.sort[0] : params.sort) as
    | SortKey
    | undefined;
  return {
    search: (Array.isArray(params.q) ? params.q[0] : params.q ?? "").trim(),
    status: toArray(params.status) as OpportunityStatus[],
    location: toArray(params.location),
    roleFamily: toArray(params.family) as RoleFamily[],
    hasDeadline: params.deadline === "1" || params.deadline === "true",
    sponsorshipAvailable:
      params.sponsorship === "1" || params.sponsorship === "true",
    sort: sortRaw && VALID_SORTS.includes(sortRaw) ? sortRaw : DEFAULT_SORT,
  };
}

export function hasActiveFilters(f: FilterParams): boolean {
  return (
    f.search.length > 0 ||
    f.status.length > 0 ||
    f.location.length > 0 ||
    f.roleFamily.length > 0 ||
    f.hasDeadline ||
    f.sponsorshipAvailable
  );
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export function offersSponsorship(text?: string | null): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  // Guard against negative phrasing that still contains the word "sponsorship".
  const negative = [
    "cannot",
    "not able",
    "unable",
    "no sponsorship",
    "without sponsorship",
    "do not",
    "does not",
    "won't",
    "will not",
    "right to work",
  ];
  if (negative.some((n) => t.includes(n))) return false;
  return (
    t.includes("sponsorship available") ||
    t.includes("visa sponsorship") ||
    t.includes("will sponsor") ||
    t.includes("sponsors visas") ||
    t.includes("offers sponsorship")
  );
}

function matchesSearch(item: TrackerItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    item.employerName,
    item.title,
    item.divisionDesk ?? "",
    item.location,
    ROLE_FAMILY_LABEL[item.roleFamily],
    ...item.tags,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function applyFilters(
  items: TrackerItem[],
  f: FilterParams,
): TrackerItem[] {
  return items.filter((item) => {
    if (!matchesSearch(item, f.search)) return false;
    if (f.status.length > 0 && !f.status.includes(item.status)) return false;
    if (f.location.length > 0 && !f.location.includes(item.location)) return false;
    if (f.roleFamily.length > 0 && !f.roleFamily.includes(item.roleFamily))
      return false;
    if (f.hasDeadline && !item.deadlineAt) return false;
    if (f.sponsorshipAvailable && !offersSponsorship(item.sponsorshipInfo))
      return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function time(v: Date | string | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

// nulls always sort to the end regardless of direction
function compareNullable(
  a: number | null,
  b: number | null,
  dir: "asc" | "desc",
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === "asc" ? a - b : b - a;
}

export function applySort(items: TrackerItem[], sort: SortKey): TrackerItem[] {
  const copy = [...items];
  switch (sort) {
    case "best_match":
      copy.sort(
        (a, b) =>
          (b.score ?? -1) - (a.score ?? -1) ||
          compareNullable(time(a.lastSeenAt), time(b.lastSeenAt), "desc"),
      );
      break;
    case "recently_seen":
      copy.sort((a, b) =>
        compareNullable(time(a.lastSeenAt), time(b.lastSeenAt), "desc"),
      );
      break;
    case "opens":
      copy.sort((a, b) => compareNullable(time(a.opensAt), time(b.opensAt), "asc"));
      break;
    case "deadline":
      copy.sort((a, b) =>
        compareNullable(time(a.deadlineAt), time(b.deadlineAt), "asc"),
      );
      break;
    case "employer":
      copy.sort((a, b) => a.employerName.localeCompare(b.employerName));
      break;
  }
  return copy;
}

export function applyFiltersAndSort(
  items: TrackerItem[],
  f: FilterParams,
): TrackerItem[] {
  return applySort(applyFilters(items, f), f.sort);
}
