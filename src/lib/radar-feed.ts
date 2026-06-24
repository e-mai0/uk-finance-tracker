import { daysUntil } from "./utils";
import type { TrackerItem } from "./filters";

/**
 * Pure assembly of the Radar discovery feed: it decides what "changed overnight
 * / this week" — roles closing soon, newly seen, opening soon, recently closed —
 * plus a compact coverage summary of the monitored sources. Like
 * `composeBoard` in tracker-board.ts it is independent of React and Prisma so it
 * can be unit-tested. The page maps DB rows into these shapes and calls
 * `composeRadarFeed`; nothing here touches the database or the clock (inject
 * `now`), so it is pure + deterministic.
 */

/** Minimal monitored-source shape the feed needs for the coverage summary. */
export interface RadarFeedSource {
  employerName: string;
  enabled: boolean;
  watchOnly: boolean;
  lastStatus: string | null;
  /** Watch-only sources record when the page last changed (a review signal). */
  lastChangedAt: Date | string | null;
  lastSuccessfulFetchAt: Date | string | null;
}

export interface RadarCoverage {
  /** Distinct firms we monitor (sources ∪ firms with listings). */
  tracked: number;
  /** Sources publishing automatically: !watchOnly && enabled && reachable. */
  liveFeeds: number;
  /** Watch-only sources (diffed for change, never auto-published). */
  watching: number;
  /** Sources that need a human: changed watchers, disabled, or unreachable. */
  needsAttention: number;
  /** Most recent successful fetch across all sources (ISO), or null. */
  lastSweepAt: string | null;
}

export interface RadarFreshItem extends TrackerItem {
  /** First seen within `overnightHours` — the tightest "brand new" subset. */
  isOvernight: boolean;
}

export interface RadarFeed {
  closingSoon: TrackerItem[];
  fresh: RadarFreshItem[];
  freshOverflow: number;
  openingSoon: TrackerItem[];
  recentlyClosed: TrackerItem[];
  coverage: RadarCoverage;
}

const DEFAULT_OVERNIGHT_HOURS = 36;
const DEFAULT_WEEK_DAYS = 7;
const DEFAULT_CLOSING_SOON_DAYS = 7;
const DEFAULT_FRESH_LIMIT = 6;

const norm = (s: string) => s.trim().toLowerCase();

/** Normalize a Date | string | null into epoch ms, or null when unparseable. */
function time(v: Date | string | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/** A source whose last run hit a bot challenge / block — reported honestly
 *  rather than silently retried or auto-disabled. Lifted from radar/page.tsx. */
function isUnreachable(s: RadarFeedSource): boolean {
  return (s.lastStatus ?? "").toLowerCase().startsWith("unreachable");
}

export function composeRadarFeed(opts: {
  /** Every opportunity for the user (flattened TrackerItems). */
  items: TrackerItem[];
  /** Every monitored source (may include disabled / watch-only). */
  sources: RadarFeedSource[];
  now: Date;
  overnightHours?: number;
  weekDays?: number;
  closingSoonDays?: number;
  freshLimit?: number;
}): RadarFeed {
  const {
    items,
    sources,
    now,
    overnightHours = DEFAULT_OVERNIGHT_HOURS,
    weekDays = DEFAULT_WEEK_DAYS,
    closingSoonDays = DEFAULT_CLOSING_SOON_DAYS,
    freshLimit = DEFAULT_FRESH_LIMIT,
  } = opts;

  const nowMs = now.getTime();

  // --- Closing soon -------------------------------------------------------
  // Exact semantics of composeBoard.closingThisWeek: OPEN, real (not estimated)
  // non-rolling deadline, 0..closingSoonDays out — no false urgency. Soonest
  // first.
  const closingSoon = items
    .filter((i) => {
      if (i.status !== "OPEN") return false;
      if (!i.deadlineAt || i.deadlineEstimated || i.isRolling) return false;
      const d = daysUntil(i.deadlineAt, now);
      return d != null && d >= 0 && d <= closingSoonDays;
    })
    .sort((a, b) => (time(a.deadlineAt) ?? 0) - (time(b.deadlineAt) ?? 0));

  // --- Fresh --------------------------------------------------------------
  // firstSeenAt within the last `weekDays` (same convention as
  // signals.isFreshListing: age = daysUntil(firstSeenAt) is ≤0 in the past, in
  // window when age >= -weekDays). Newest first, then capped; isOvernight is the
  // tighter `overnightHours` subset computed from real hour deltas.
  const overnightMs = overnightHours * 60 * 60 * 1000;
  const inWindowFresh = items
    .filter((i) => {
      const age = daysUntil(i.firstSeenAt, now);
      return age != null && age <= 0 && age >= -weekDays;
    })
    .sort((a, b) => (time(b.firstSeenAt) ?? 0) - (time(a.firstSeenAt) ?? 0));

  const fresh: RadarFreshItem[] = inWindowFresh.slice(0, freshLimit).map((i) => {
    const seen = time(i.firstSeenAt);
    const isOvernight = seen != null && nowMs - seen <= overnightMs;
    return { ...i, isOvernight };
  });
  const freshOverflow = inWindowFresh.length - fresh.length;

  // --- Opening soon -------------------------------------------------------
  const openingSoon = items
    .filter((i) => i.status === "OPENING_SOON")
    .sort((a, b) => {
      const ta = time(a.opensAt);
      const tb = time(b.opensAt);
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return ta - tb;
    });

  // --- Recently closed ----------------------------------------------------
  // CLOSED with a real closedAt within the last `weekDays`, newest-closed-first.
  // A CLOSED role with closedAt=null is excluded (don't crash).
  const recentlyClosed = items
    .filter((i) => {
      if (i.status !== "CLOSED") return false;
      const age = daysUntil(i.closedAt, now);
      return age != null && age <= 0 && age >= -weekDays;
    })
    .sort((a, b) => (time(b.closedAt) ?? 0) - (time(a.closedAt) ?? 0));

  // --- Coverage -----------------------------------------------------------
  const liveFeeds = sources.filter(
    (s) => !s.watchOnly && s.enabled && !isUnreachable(s),
  ).length;
  const watching = sources.filter((s) => s.watchOnly).length;
  const needsAttention = sources.filter(
    (s) =>
      (s.watchOnly && time(s.lastChangedAt) != null) ||
      !s.enabled ||
      isUnreachable(s),
  ).length;

  const trackedFirms = new Set<string>([
    ...sources.map((s) => norm(s.employerName)),
    ...items.map((i) => norm(i.employerName)),
  ]);

  const lastSweep = sources.reduce<number | null>((max, s) => {
    const t = time(s.lastSuccessfulFetchAt);
    if (t == null) return max;
    return max == null || t > max ? t : max;
  }, null);

  const coverage: RadarCoverage = {
    tracked: trackedFirms.size,
    liveFeeds,
    watching,
    needsAttention,
    lastSweepAt: lastSweep != null ? new Date(lastSweep).toISOString() : null,
  };

  return { closingSoon, fresh, freshOverflow, openingSoon, recentlyClosed, coverage };
}
