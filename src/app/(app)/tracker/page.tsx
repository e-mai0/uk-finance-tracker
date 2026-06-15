import { Suspense } from "react";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getTrackerItems } from "@/server/queries/opportunities";
import { getOpenAttentionByTarget } from "@/server/queries/attention";
import { parseFilters, applyFiltersAndSort, hasActiveFilters } from "@/lib/filters";
import { daysUntil } from "@/lib/utils";
import { composeBoard, type BoardListingRow } from "@/lib/tracker-board";
import { FiltersBar } from "@/components/tracker/filters-bar";
import { Board } from "@/components/tracker/board";
import { TickerTape } from "@/components/tracker/ticker-tape";
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

  const [sp, allItems, attention, sources] = await Promise.all([
    searchParams,
    getTrackerItems(userId),
    getOpenAttentionByTarget(userId, "opportunity"),
    prisma.ingestionSource.findMany(),
  ]);

  const filters = parseFilters(sp);
  const items = applyFiltersAndSort(allItems, filters);

  const now = new Date();

  // Map the filtered view into board rows (fit, freshness, agent tags). All
  // ordering, the "Opening soon" derivation, and the counts are decided by the
  // pure composeBoard() so they stay testable.
  const listingRows: BoardListingRow[] = items.map((it) => ({
    kind: "listing" as const,
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
    agentTags: (attention.get(it.id) ?? []).map((a) => ({ kind: a.kind, title: a.title })),
  }));

  const { rows, stats } = composeBoard({
    listingRows,
    allOpportunities: allItems,
    sources,
    filtersActive: hasActiveFilters(filters),
    now,
  });

  return (
    <div className="animate-rise">
      {/* Live tape — full width across the page; the docked rail starts below it.
          On lg the tape breaks out of the dock-reserved column (-mr matches the
          dock's reserved width) so it spans edge to edge. */}
      <div className="lg:-mr-[360px]">
        <TickerTape items={allItems} />
      </div>

      {/* Starred view keeps the deadline export; the title/stats bar is gone —
          counts live in the filter pills, the board footer carries the legend. */}
      {filters.starred && (
        <div className="flex justify-end border-b border-border bg-surface px-4 py-2">
          <a
            href="/api/saved/calendar"
            download
            className="label rounded-pill border border-border bg-surface px-3 py-1.5 text-subtle hover:text-ink"
          >
            ⤓ EXPORT DEADLINES (.ICS)
          </a>
        </div>
      )}

      {/* Filter line — no hard full-width rule (it used to ram the dock edge);
          the board card below provides the separation. */}
      <Suspense fallback={null}>
        <FiltersBar />
      </Suspense>

      {/* The board — discovery (fresh finds + Firm Scout) now lives on /radar */}
      <div className="p-4">
        <Board rows={rows} stats={stats} />
      </div>
    </div>
  );
}
