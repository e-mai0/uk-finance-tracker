import { Suspense } from "react";
import { auth } from "@/server/auth";
import { getTrackerItems } from "@/server/queries/opportunities";
import { parseFilters, applyFiltersAndSort } from "@/lib/filters";
import { daysUntil, formatShortDate } from "@/lib/utils";
import { FiltersBar } from "@/components/tracker/filters-bar";
import { OpportunityTable } from "@/components/tracker/opportunity-table";
import { SummaryCards } from "@/components/tracker/summary-cards";
import { TopMatches } from "@/components/tracker/top-matches";
import { TickerTape } from "@/components/tracker/ticker-tape";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tracker — Trackr" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const userId = session!.user.id;

  const [sp, allItems] = await Promise.all([
    searchParams,
    getTrackerItems(userId),
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

  return (
    <div className="animate-rise">
      {/* Live tape — completes the dark command rail beneath the header */}
      <TickerTape items={allItems} />

      {/* Title strip */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-surface px-3 py-2">
        <div className="flex items-baseline gap-3">
          <span className="label text-subtle">Trackr Desk</span>
          <span className="text-[0.95rem] font-semibold tracking-tight text-ink">
            Summer 2027{" "}
            <span className="text-subtle">· UK finance internships</span>
          </span>
        </div>
        <div className="label flex items-center gap-2 text-subtle">
          <span className="tabular text-ink">{allItems.length}</span> positions
          <span aria-hidden className="text-border-strong">
            │
          </span>
          <span className="tabular text-ink">{employerCount}</span> firms
        </div>
      </div>

      {/* Index ribbon */}
      <div className="border-b border-border">
        <SummaryCards stats={stats} />
      </div>

      {/* Filter line */}
      <div className="border-b border-border-strong">
        <Suspense fallback={null}>
          <FiltersBar resultCount={items.length} />
        </Suspense>
      </div>

      {/* Main — grid + watchlist butt together, divided by one hairline */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="min-w-0 border-border-strong lg:border-r">
          <OpportunityTable items={items} />
        </div>
        <aside className="border-t border-border-strong lg:sticky lg:top-12 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-auto lg:border-t-0">
          <TopMatches items={allItems} />
        </aside>
      </div>

      {/* Status / legend footer */}
      <div className="label flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-strong bg-surface-2 px-3 py-2 text-subtle">
        <Legend tone="text-success" glyph="▲" label="Open" />
        <Legend tone="text-warning" glyph="◆" label="Soon" />
        <Legend tone="text-danger" glyph="▼" label="Closing" />
        <Legend tone="text-faint" glyph="·" label="Closed" />
        <span className="ml-auto flex items-center gap-3">
          <span>Deterministic · No ML</span>
          {lastSync > 0 && (
            <>
              <span aria-hidden className="text-border-strong">
                │
              </span>
              <span>
                Last sync{" "}
                <span className="tabular text-muted">
                  {formatShortDate(new Date(lastSync))}
                </span>
              </span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function Legend({
  tone,
  glyph,
  label,
}: {
  tone: string;
  glyph: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={tone}>
        {glyph}
      </span>
      {label}
    </span>
  );
}
