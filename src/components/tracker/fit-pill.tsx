import { cn } from "@/lib/utils";
import { fitTier, fitTierLabel } from "@/lib/scoring";

const TIER_STYLES = {
  strong: "bg-success-soft text-success",
  good: "bg-accent-soft text-accent",
  moderate: "bg-warning-soft text-warning",
  low: "bg-surface-2 text-subtle",
} as const;

export function FitPill({
  score,
  showLabel = false,
  className,
}: {
  score: number | undefined | null;
  showLabel?: boolean;
  className?: string;
}) {
  if (score == null) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-subtle",
          className,
        )}
      >
        —
      </span>
    );
  }

  const tier = fitTier(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold tabular",
        TIER_STYLES[tier],
        className,
      )}
      title={fitTierLabel(score)}
    >
      {score}
      {showLabel && <span className="font-medium">· {fitTierLabel(score)}</span>}
    </span>
  );
}
