import { daysUntil } from "./utils";

/**
 * Pure assembly of the tracker board: it decides which rows show, in what
 * order, and the status-line counts — independent of React and the database so
 * it can be unit-tested. The page maps DB rows into these shapes and calls
 * `composeBoard`; nothing here touches Prisma.
 */

/** A live opportunity (firm + role + status) — the normal, clickable row. */
export type BoardListingRow = {
  kind: "listing";
  id: string;
  employerName: string;
  title: string;
  divisionDesk: string | null;
  status: string; // OpportunityStatus
  deadlineAt: string | null; // ISO
  /** Deadline inferred from the recruiting cycle, not a stated date. */
  deadlineEstimated: boolean;
  /** Rolling intake — may close once filled, ahead of any deadline. */
  isRolling: boolean;
  daysLeft: number | null;
  score: number | undefined;
  saved: boolean;
  /** First seen within the last 7 days (isFreshListing) — radar/scout finds. */
  fresh: boolean;
  agentTags: { kind: string; title: string }[];
};

/** A firm we monitor that has no live listing yet — shown at the bottom under
 *  "Opening soon", in the same table style as the live rows. */
export type BoardTrackedRow = {
  kind: "tracked";
  id: string;
  employerName: string;
};

export type BoardRow = BoardListingRow | BoardTrackedRow;

export type BoardStats = {
  /** Distinct firms we monitor (sources ∪ firms with listings). */
  tracked: number;
  /** Listings currently open or opening soon. */
  live: number;
  /** Open listings with a stated deadline ≤7 days out. */
  closingThisWeek: number;
  /** Most recent successful fetch across all sources (ISO), or null. */
  lastSyncAt: string | null;
};

/** Minimal opportunity shape needed for counts + the "already listed" check. */
export interface BoardOpportunity {
  employerName: string;
  status: string;
  deadlineAt?: Date | string | null;
  deadlineEstimated?: boolean;
  isRolling?: boolean;
}

/** Minimal monitored-source shape: the firm and when it last fetched cleanly. */
export interface BoardSource {
  employerName: string;
  lastSuccessfulFetchAt?: Date | string | null;
}

const CLOSING_THIS_WEEK_DAYS = 7;
const norm = (s: string) => s.trim().toLowerCase();

export function composeBoard(opts: {
  /** Listing rows for the *filtered* view, in the user's chosen sort order. */
  listingRows: BoardListingRow[];
  /** Every opportunity (unfiltered) — drives counts and the exclusion set. */
  allOpportunities: BoardOpportunity[];
  /** Every monitored source (may include disabled). */
  sources: BoardSource[];
  /** When the user is filtering/searching, "Opening soon" is suppressed. */
  filtersActive: boolean;
  now: Date;
}): { rows: BoardRow[]; stats: BoardStats } {
  const { listingRows, allOpportunities, sources, filtersActive, now } = opts;

  // Live first (honoring incoming sort), then CLOSED — stable, so the chosen
  // sort is preserved within each tier.
  const liveRows = listingRows.filter((r) => r.status !== "CLOSED");
  const closedRows = listingRows.filter((r) => r.status === "CLOSED");

  // A firm is "already listed" if any opportunity exists under its name, so it
  // never appears in both the live list and Opening soon at once.
  const listedFirms = new Set(allOpportunities.map((o) => norm(o.employerName)));

  const firmByName = new Map<string, string>();
  for (const s of sources) {
    const key = norm(s.employerName);
    if (!firmByName.has(key)) firmByName.set(key, s.employerName);
  }

  const trackedRows: BoardRow[] = filtersActive
    ? []
    : [...firmByName.entries()]
        .filter(([key]) => !listedFirms.has(key))
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([key, name]) => ({ kind: "tracked" as const, id: key, employerName: name }));

  const rows: BoardRow[] = [...liveRows, ...closedRows, ...trackedRows];

  const allFirmNames = new Set<string>([
    ...sources.map((s) => norm(s.employerName)),
    ...allOpportunities.map((o) => norm(o.employerName)),
  ]);

  const live = allOpportunities.filter(
    (o) => o.status === "OPEN" || o.status === "OPENING_SOON",
  ).length;

  const closingThisWeek = allOpportunities.filter((o) => {
    if (o.status !== "OPEN") return false;
    if (!o.deadlineAt || o.deadlineEstimated || o.isRolling) return false;
    const d = daysUntil(o.deadlineAt, now);
    return d != null && d >= 0 && d <= CLOSING_THIS_WEEK_DAYS;
  }).length;

  const lastSync = sources.reduce<Date | null>((max, s) => {
    if (!s.lastSuccessfulFetchAt) return max;
    const t =
      s.lastSuccessfulFetchAt instanceof Date
        ? s.lastSuccessfulFetchAt
        : new Date(s.lastSuccessfulFetchAt);
    if (Number.isNaN(t.getTime())) return max;
    return !max || t > max ? t : max;
  }, null);

  const stats: BoardStats = {
    tracked: allFirmNames.size,
    live,
    closingThisWeek,
    lastSyncAt: lastSync ? lastSync.toISOString() : null,
  };

  return { rows, stats };
}
