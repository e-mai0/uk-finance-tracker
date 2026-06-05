export interface SummaryStats {
  openCount: number;
  newlyAdded: number;
  deadlinesSoon: number;
  topMatches: number;
}

const CARDS: {
  key: keyof SummaryStats;
  label: string;
  hint: string;
}[] = [
  { key: "openCount", label: "Open now", hint: "Accepting applications" },
  { key: "newlyAdded", label: "New this week", hint: "Added in last 7 days" },
  { key: "deadlinesSoon", label: "Deadlines soon", hint: "Closing within 14 days" },
  { key: "topMatches", label: "Strong matches", hint: "Fit score 75+" },
];

export function SummaryCards({ stats }: { stats: SummaryStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((c) => (
        <div
          key={c.key}
          className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3.5"
        >
          <div className="text-2xl font-semibold tracking-tight text-ink tabular">
            {stats[c.key]}
          </div>
          <div className="mt-0.5 text-sm font-medium text-ink">{c.label}</div>
          <div className="text-xs text-subtle">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}
