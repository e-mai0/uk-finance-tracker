import { daysUntil } from "./utils";
import type { TrackerItem } from "./filters";

/**
 * Pure assembly of the Radar feed — re-scoped by ADR-012 to "what Cyclops did
 * while you were away": a sync digest (sources checked, last sync, N new,
 * M closed), the roles first seen in the window, the roles that closed in the
 * window (with per-user saved/applied markers), and a compact coverage summary
 * of the monitored sources. The old closingSoon/openingSoon sections were
 * dropped: closing urgency belongs to Today/tracker, and "opening soon" is
 * speculation rather than something that happened.
 *
 * Like `composeBoard` in tracker-board.ts it is independent of React and
 * Prisma so it can be unit-tested. The page maps DB rows into these shapes and
 * calls `composeRadarFeed`; nothing here touches the database or the clock
 * (inject `now`), so it is pure + deterministic. The session user's saved /
 * applied opportunity-id sets are INPUTS — this module never queries them.
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

/**
 * The one-line "what happened under the hood" digest. Counts are derived from
 * the SAME arrays the sections render (`fresh`+`freshOverflow` and
 * `recentlyClosed`) so the headline can never disagree with the content below.
 */
export interface RadarDigest {
  /** Sources the sweep attempts: enabled ones (disabled sources are skipped). */
  sourcesChecked: number;
  /** Identical to coverage.lastSweepAt — most recent successful fetch (ISO). */
  lastSyncAt: string | null;
  /** New roles in the window == fresh.length + freshOverflow. */
  newCount: number;
  /** Roles closed in the window == recentlyClosed.length. */
  closedCount: number;
}

export interface RadarFreshItem extends TrackerItem {
  /** First seen within `overnightHours` — the tightest "brand new" subset. */
  isOvernight: boolean;
}

export interface RadarClosedItem extends TrackerItem {
  /** The session user had saved this role (id ∈ injected savedIds). */
  youSaved: boolean;
  /** The session user had an application on this role (id ∈ appliedIds). */
  youApplied: boolean;
}

export interface RadarFeed {
  digest: RadarDigest;
  fresh: RadarFreshItem[];
  freshOverflow: number;
  recentlyClosed: RadarClosedItem[];
  coverage: RadarCoverage;
}

const DEFAULT_OVERNIGHT_HOURS = 36;
const DEFAULT_WEEK_DAYS = 7;
const DEFAULT_FRESH_LIMIT = 6;

const EMPTY_IDS: ReadonlySet<string> = new Set();

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
  /** The session user's saved opportunity ids (exact-match intersection). */
  savedIds?: ReadonlySet<string>;
  /** The session user's applied opportunity ids (exact-match intersection). */
  appliedIds?: ReadonlySet<string>;
  overnightHours?: number;
  weekDays?: number;
  freshLimit?: number;
}): RadarFeed {
  const {
    items,
    sources,
    now,
    savedIds = EMPTY_IDS,
    appliedIds = EMPTY_IDS,
    overnightHours = DEFAULT_OVERNIGHT_HOURS,
    weekDays = DEFAULT_WEEK_DAYS,
    freshLimit = DEFAULT_FRESH_LIMIT,
  } = opts;

  const nowMs = now.getTime();

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

  // --- Recently closed ------------------------------------------------------
  // CLOSED with a real closedAt within the last `weekDays`, newest-closed-first.
  // A CLOSED role with closedAt=null is excluded (don't crash). Each row is
  // marked when it intersects the session user's saved/applied id sets — pure
  // exact-id set membership, so one user's sets can never mark another's view.
  const recentlyClosed: RadarClosedItem[] = items
    .filter((i) => {
      if (i.status !== "CLOSED") return false;
      const age = daysUntil(i.closedAt, now);
      return age != null && age <= 0 && age >= -weekDays;
    })
    .sort((a, b) => (time(b.closedAt) ?? 0) - (time(a.closedAt) ?? 0))
    .map((i) => ({
      ...i,
      youSaved: savedIds.has(i.id),
      youApplied: appliedIds.has(i.id),
    }));

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

  // --- Digest ---------------------------------------------------------------
  // Derived from the arrays above (NOT recomputed from raw items) so the
  // headline counts can never disagree with what the sections render.
  const digest: RadarDigest = {
    sourcesChecked: sources.filter((s) => s.enabled).length,
    lastSyncAt: coverage.lastSweepAt,
    newCount: fresh.length + freshOverflow,
    closedCount: recentlyClosed.length,
  };

  return { digest, fresh, freshOverflow, recentlyClosed, coverage };
}
