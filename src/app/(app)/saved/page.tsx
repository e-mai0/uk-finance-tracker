import Link from "next/link";
import { auth } from "@/server/auth";
import { getSavedItems } from "@/server/queries/opportunities";
import { applySort } from "@/lib/filters";
import { OpportunityTable } from "@/components/tracker/opportunity-table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved — Trackr" };

export default async function SavedPage() {
  const session = await auth();
  const items = applySort(await getSavedItems(session!.user.id), "best_match");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Saved roles
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {items.length === 0
            ? "Roles you save will appear here, ranked by fit."
            : `${items.length} saved ${items.length === 1 ? "role" : "roles"}, ranked by fit.`}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-6 py-16 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-subtle">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 3.5h10a1 1 0 011 1V17l-6-3.2L4 17V4.5a1 1 0 011-1z" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-ink">
            Nothing saved yet
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Browse the tracker and tap the bookmark on any role to build your
            shortlist.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block">
            <Button size="sm">Go to tracker</Button>
          </Link>
        </div>
      ) : (
        <OpportunityTable items={items} />
      )}
    </div>
  );
}
