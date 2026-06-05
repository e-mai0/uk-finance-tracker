import Link from "next/link";
import type { TrackerItem } from "@/lib/filters";
import { Monogram } from "@/components/ui/monogram";
import { FitPill } from "./fit-pill";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_FAMILY_SHORT } from "@/lib/constants";

export function TopMatches({ items }: { items: TrackerItem[] }) {
  const top = [...items]
    .filter((i) => i.score != null && i.status !== "CLOSED")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Top matches for you</CardTitle>
      </CardHeader>
      {top.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">
          Complete your profile to surface your strongest-fit roles here.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {top.map((item, i) => (
            <li key={item.id}>
              <Link
                href={`/opportunities/${item.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="w-4 text-xs font-semibold text-subtle tabular">
                  {i + 1}
                </span>
                <Monogram name={item.employerName} hint={item.logoHint} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">
                    {item.title}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {item.employerName} · {ROLE_FAMILY_SHORT[item.roleFamily]}
                  </div>
                </div>
                <FitPill score={item.score} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
