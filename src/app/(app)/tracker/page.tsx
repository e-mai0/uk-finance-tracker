import { Suspense } from "react";
import { auth } from "@/server/auth";
import { getTrackerItems } from "@/server/queries/opportunities";
import { getOpenAttentionByTarget } from "@/server/queries/attention";
import { parseFilters, applyFiltersAndSort } from "@/lib/filters";
import { daysUntil, formatShortDate } from "@/lib/utils";
import { FiltersBar } from "@/components/tracker/filters-bar";
import { Board } from "@/components/tracker/board";
import { TickerTape } from "@/components/tracker/ticker-tape";
import { FreshFinds } from "@/components/tracker/fresh-finds";
import { ScoutCard } from "@/components/tracker/scout-card";
import { isFreshListing } from "@/components/tracker/signals";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tracker — Trackr" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const userId = session!.user.id;

  const [sp, allItems, attention] = await Promise.all([
    searchParams,
    getTrackerItems(userId),
    getOpenAttentionByTarget(userId, "opportunity"),
  ]);

  const filters = parseFilters(sp);
  const items = applyFiltersAndSort(allItems, filters);

  const now = new Date();
  const stats = {
    openCount: allItems.filter((i) => i.status === "OPEN").length,
    newlyAdded: allItems.filter((i) => {
      const age = daysUntil(i.firstSeenAt, now);
      return age !== null && age <= 0 && age >= -7;
    }).length,
    deadlinesSoon: allItems.filter((i) => {
      const d = daysUntil(i.deadlineAt, now);
      return d !== null && d >= 0 && d <= 14;
    }).length,
    topMatches: allItems.filter((i) => (i.score ?? 0) >= 75).length,
  };

  const employerCount = new Set(allItems.map((i) => i.employerName)).size;
  const lastSync = allItems
    .map((i) => new Date(i.lastSeenAt).getTime())
    .reduce((a, b) => Math.max(a, b), 0);

  const rows = items.map((it) => ({
    id: it.id,
    employerName: it.employerName,
    title: it.title,
    divisionDesk: it.divisionDesk ?? null,
    status: it.status,
    deadlineAt: it.deadlineAt ? new Date(it.deadlineAt).toISOString() : null,
    deadlineEstimated: it.deadlineEstimated === true,
    isRolling: it.isRolling === true,
    daysLeft: daysUntil(it.deadlineAt, now),
    score: it.score,
    saved: it.saved === true,
    fresh: isFreshListing(it.firstSeenAt, now),
    agentTags: (attention.get(it.id) ?? []).map((a) => ({
      kind: a.kind,
      title: a.title,
    })),
  }));

  return (
    <div className="animate-rise">
      {/* Live tape — stays the first element, full width (user requirement) */}
      <TickerTape items={allItems} />

      {/* Title strip */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[1.375rem] leading-none text-ink">Tracker</h1>
          <span className="text-[0.8125rem] text-subtle">
            Summer 2027 · UK finance internships
          </span>
        </div>
        <div className="label flex flex-wrap items-center gap-2 text-subtle">
          <span>
            <span className="tabular text-ink">{allItems.length}</span> positions
          </span>
          <span aria-hidden className="text-border-strong">│</span>
          <span>
            <span className="tabular text-ink">{employerCount}</span> firms
          </span>
          {lastSync > 0 && (
            <>
              <span aria-hidden className="text-border-strong">│</span>
              <span>
                Synced{" "}
                <span className="tabular text-muted">
                  {formatShortDate(new Date(lastSync))}
                </span>
              </span>
            </>
          )}
          <span aria-hidden className="text-border-strong">│</span>
          <span>Deterministic · No ML</span>
          {filters.starred && (
            <a
              href="/api/saved/calendar"
              download
              className="label rounded-pill border border-border bg-surface px-3 py-1.5 text-subtle hover:text-ink"
            >
              ⤓ EXPORT DEADLINES (.ICS)
            </a>
          )}
        </div>
      </div>

      {/* Stats line — the old index ribbon, inlined */}
      <div className="label flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-4 py-2 text-subtle">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="text-success">▲</span>
          Open <span className="tabular text-ink">{stats.openCount}</span>
        </span>
        <span className="flex items-center gap-1.5">
          New · 7d <span className="tabular text-ink">{stats.newlyAdded}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="text-warning">▼</span>
          Closing · 14d{" "}
          <span className="tabular text-ink">{stats.deadlinesSoon}</span>
        </span>
        <span className="flex items-center gap-1.5">
          {/* Fit-high mark — green tier ramp, not amber (amber means agent). */}
          <span aria-hidden className="text-tier-strong">●</span>
          Match ≥ 75 <span className="tabular text-ink">{stats.topMatches}</span>
        </span>
      </div>

      {/* Filter line */}
      <div className="border-b border-border-strong">
        <Suspense fallback={null}>
          <FiltersBar resultCount={items.length} />
        </Suspense>
      </div>

      {/* The board */}
      <div className="p-4">
        <Board rows={rows} />
      </div>

      {/* Radar rails — live-source discoveries + the Firm Scout growth loop */}
      <div className="grid gap-4 p-4 pt-0 lg:grid-cols-2">
        <div className="overflow-hidden rounded-card border border-border shadow-card">
          <FreshFinds items={allItems} />
        </div>
        <div className="overflow-hidden rounded-card border border-border shadow-card">
          <ScoutCard />
        </div>
      </div>
    </div>
  );
}
