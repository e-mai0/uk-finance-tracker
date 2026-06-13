import { Suspense } from "react";
import { auth } from "@/server/auth";
import { getTrackerItems } from "@/server/queries/opportunities";
import { getOpenAttentionByTarget } from "@/server/queries/attention";
import { parseFilters, applyFiltersAndSort } from "@/lib/filters";
import { daysUntil } from "@/lib/utils";
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

  const rows = items.map((it) => ({
    id: it.id,
    employerName: it.employerName,
    title: it.title,
    divisionDesk: it.divisionDesk ?? null,
    status: it.status,
    deadlineAt: it.deadlineAt ? new Date(it.deadlineAt).toISOString() : null,
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
        <FiltersBar resultCount={items.length} />
      </Suspense>

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
