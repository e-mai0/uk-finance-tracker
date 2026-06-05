import { Suspense } from "react";
import { auth } from "@/server/auth";
import { getTrackerItems } from "@/server/queries/opportunities";
import { parseFilters, applyFiltersAndSort } from "@/lib/filters";
import { daysUntil } from "@/lib/utils";
import { FiltersBar } from "@/components/tracker/filters-bar";
import { OpportunityTable } from "@/components/tracker/opportunity-table";
import { SummaryCards } from "@/components/tracker/summary-cards";
import { TopMatches } from "@/components/tracker/top-matches";

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Your tracker
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          UK finance summer internships, ranked by fit. {allItems.length}{" "}
          opportunities across {new Set(allItems.map((i) => i.employerName)).size}{" "}
          employers.
        </p>
      </div>

      <SummaryCards stats={stats} />

      <Suspense fallback={null}>
        <FiltersBar resultCount={items.length} />
      </Suspense>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <OpportunityTable items={items} />
        <aside className="space-y-5 lg:sticky lg:top-32 lg:self-start">
          <TopMatches items={allItems} />
        </aside>
      </div>
    </div>
  );
}
