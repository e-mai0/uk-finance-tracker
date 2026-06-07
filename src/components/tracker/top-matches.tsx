import Link from "next/link";
import type { TrackerItem } from "@/lib/filters";
import { FitPill } from "./fit-pill";
import { ROLE_FAMILY_SHORT } from "@/lib/constants";
import { ticker, locCode } from "@/lib/utils";

/** Watchlist — the ranked strong-fit positions, by ticker CODE. */
export function TopMatches({ items }: { items: TrackerItem[] }) {
  const top = [...items]
    .filter((i) => i.score != null && i.status !== "CLOSED")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 7);

  return (
    <div className="h-full bg-surface">
      <div className="flex items-center justify-between border-b border-border-strong bg-surface-2 px-3 py-[0.5625rem]">
        <span className="label text-[0.62rem] text-ink">Watchlist</span>
        <span className="label text-[0.62rem] text-accent">Fit ≥ 75</span>
      </div>
      {top.length === 0 ? (
        <p className="px-3 py-6 text-sm text-muted">
          Complete your profile to surface your strongest-fit positions here.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {top.map((item, i) => (
            <li key={item.id}>
              <Link
                href={`/opportunities/${item.id}`}
                className="group grid grid-cols-[1.25rem_3.25rem_minmax(0,1fr)_auto] items-center gap-2.5 border-l-2 border-transparent px-3 py-2 transition-colors hover:border-accent hover:bg-accent-tint"
              >
                <span className="tabular text-[0.72rem] text-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="tabular truncate text-[0.84rem] font-bold tracking-tight text-accent">
                  {ticker(item.employerName)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.88rem] font-semibold leading-snug text-ink">
                    {item.employerName}
                  </span>
                  <span className="block truncate text-[0.74rem] leading-snug text-muted">
                    {ROLE_FAMILY_SHORT[item.roleFamily]} · {locCode(item.location)}
                  </span>
                </span>
                <FitPill score={item.score} className="text-[1.05rem] font-bold" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
