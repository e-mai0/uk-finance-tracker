import Link from "next/link";
import type { TrackerItem } from "@/lib/filters";
import { locCode, ticker } from "@/lib/utils";
import { isFreshListing } from "./signals";

/** Fresh finds — listings first seen in the last week, newest first. This is
 *  where live-source discoveries (cron syncs + Firm Scout) surface, so new
 *  niche roles are visible the day they appear rather than buried in the grid. */
export function FreshFinds({ items }: { items: TrackerItem[] }) {
  const now = new Date();
  const fresh = items
    .filter((i) => isFreshListing(i.firstSeenAt, now))
    .sort(
      (a, b) =>
        new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime(),
    )
    .slice(0, 6);

  return (
    <div className="bg-surface">
      <div className="flex items-center justify-between border-b border-hairline bg-surface-2 px-3 py-[0.5625rem]">
        <span className="label text-ink">
          <span className="text-success">✚</span> Fresh finds
        </span>
        <span className="label text-subtle">Last 7d</span>
      </div>
      {fresh.length === 0 ? (
        <p className="px-3 py-4 text-[0.78rem] text-muted">
          No new listings this week. Scout a firm below to widen the radar.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {fresh.map((item) => (
            <li key={item.id}>
              <Link
                href={`/opportunities/${item.id}`}
                className="block border-l-2 border-transparent px-3 py-2 transition-colors hover:border-accent hover:bg-accent-tint"
              >
                <div className="flex items-baseline gap-2.5">
                  <span aria-hidden className="text-[0.6875rem] text-success">
                    ●
                  </span>
                  <span className="tabular shrink-0 text-[0.78rem] tracking-tight text-accent">
                    {ticker(item.employerName)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.8rem] leading-snug text-ink">
                    {item.title}
                  </span>
                  <span className="tabular text-[0.72rem] text-subtle">
                    {locCode(item.location)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
