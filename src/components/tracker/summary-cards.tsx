import { cn } from "@/lib/utils";

export interface SummaryStats {
  openCount: number;
  newlyAdded: number;
  deadlinesSoon: number;
  topMatches: number;
}

const CELLS: {
  key: keyof SummaryStats;
  label: string;
  glyph?: string;
  hint: string;
  tone?: string;
}[] = [
  { key: "openCount", label: "Open", glyph: "▲", hint: "accepting", tone: "text-success" },
  { key: "newlyAdded", label: "New · 7d", hint: "this week" },
  {
    key: "deadlinesSoon",
    label: "Closing · 14d",
    glyph: "▼",
    hint: "deadline soon",
    tone: "text-warning",
  },
  {
    key: "topMatches",
    label: "Match ≥ 75",
    glyph: "●",
    hint: "strong fit",
    tone: "text-accent",
  },
];

/** The index ribbon — a flat, hairline-divided strip of the day's figures,
 *  read like a terminal's market-summary bar. ▲ up / ▼ closing / ● match. */
export function SummaryCards({ stats }: { stats: SummaryStats }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden bg-border md:grid-cols-4">
      {CELLS.map((c) => (
        <div key={c.key} className="bg-surface px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            {c.glyph && (
              <span aria-hidden className={cn("text-[0.6875rem] leading-none", c.tone)}>
                {c.glyph}
              </span>
            )}
            <span className="label text-subtle">{c.label}</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className={cn(
                "tabular text-[1.7rem] leading-none",
                c.tone ?? "text-ink",
              )}
            >
              {stats[c.key]}
            </span>
            <span className="text-[0.7rem] text-subtle">{c.hint}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
