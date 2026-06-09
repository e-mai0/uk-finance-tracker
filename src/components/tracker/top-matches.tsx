import Link from "next/link";
import type { TrackerItem } from "@/lib/filters";
import { FitPill, FitBar } from "./fit-pill";
import { StatusBadge } from "./status-badge";
import { DaysLeft } from "./signals";
import { ticker, locCode, formatShortDate, daysUntil } from "@/lib/utils";

/** Watchlist — the ranked strong-fit positions, by ticker CODE. Enriched to the
 *  grid's calibre: each item carries status, location, deadline + a colour-coded
 *  days-left countdown and a segmented fit meter, in the same signal vocabulary
 *  as a table row (colour-coded number, uppercase status text — not pills). */
export function TopMatches({ items }: { items: TrackerItem[] }) {
  const top = [...items]
    .filter((i) => i.score != null && i.status !== "CLOSED")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 7);

  return (
    <div className="h-full bg-surface">
      <div className="flex items-center justify-between border-b border-border-strong bg-surface-2 px-3 py-[0.5625rem]">
        <span className="label text-[0.62rem] text-ink">
          <span className="text-accent">★</span> Watchlist
        </span>
        <span className="label text-[0.62rem] text-accent">Fit ≥ 75</span>
      </div>
      {top.length === 0 ? (
        <p className="px-3 py-6 text-sm text-muted">
          Complete your profile to surface your strongest-fit positions here.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {top.map((item, i) => {
            const dl = daysUntil(item.deadlineAt);
            return (
              <li key={item.id}>
                <Link
                  href={`/opportunities/${item.id}`}
                  className="block border-l-2 border-transparent px-3 py-2.5 transition-colors hover:border-accent hover:bg-accent-tint"
                >
                  {/* Line 1 — rank · code · firm · fit */}
                  <div className="flex items-baseline gap-2.5">
                    <span className="tabular text-[0.72rem] text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="tabular shrink-0 text-[0.84rem] font-bold tracking-tight text-accent">
                      {ticker(item.employerName)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.88rem] font-semibold leading-snug text-ink">
                      {item.employerName}
                    </span>
                    <FitPill
                      score={item.score}
                      className="text-[1.05rem] font-bold"
                    />
                  </div>

                  {/* Line 2 — status · loc · deadline · days-left */}
                  <div className="mt-1 flex items-center gap-2 text-[0.72rem] text-muted">
                    <StatusBadge status={item.status} />
                    <span aria-hidden className="text-border-strong">
                      │
                    </span>
                    <span className="tabular">{locCode(item.location)}</span>
                    <span className="tabular text-ink">
                      {item.deadlineAt ? formatShortDate(item.deadlineAt) : "—"}
                    </span>
                    <DaysLeft dl={dl} className="ml-auto text-[0.72rem]" />
                  </div>

                  {/* Segmented fit meter — the grid's FitBar, full width */}
                  <FitBar
                    score={item.score}
                    className="mt-1.5 !block !h-[3px] !w-full"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
