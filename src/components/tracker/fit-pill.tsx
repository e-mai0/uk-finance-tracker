import { cn } from "@/lib/utils";
import { fitTier, fitTierLabel, type FitTier } from "@/lib/scoring";

const TIER_TEXT: Record<FitTier, string> = {
  strong: "text-success",
  good: "text-accent",
  moderate: "text-warning",
  low: "text-subtle",
};

const TIER_VAR: Record<FitTier, string> = {
  strong: "var(--color-success)",
  good: "var(--color-accent)",
  moderate: "var(--color-warning)",
  low: "var(--color-subtle)",
};

/** Fit score as a colour-coded monospace number — no rounded "pill". The
 *  terminal convention: the number itself carries the signal. */
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
    return <span className={cn("tabular text-subtle", className)}>—</span>;
  }
  const tier = fitTier(score);
  return (
    <span
      className={cn("tabular", TIER_TEXT[tier], className)}
      title={fitTierLabel(score)}
    >
      {score}
      {showLabel && (
        <span className="ml-1.5 text-xs font-medium text-muted">
          {fitTierLabel(score)}
        </span>
      )}
    </span>
  );
}

/** A segmented monospace meter (Bloomberg-style) for the fit score. */
export function FitBar({
  score,
  className,
}: {
  score: number | undefined | null;
  className?: string;
}) {
  if (score == null) return null;
  const tier = fitTier(score);
  const seg = "repeating-linear-gradient(90deg, %C 0 4px, transparent 4px 5px)";
  return (
    <span
      aria-hidden
      className={cn("relative inline-block h-2 w-10 align-middle", className)}
      style={{
        background: seg.replace("%C", "var(--color-border-strong)"),
      }}
    >
      <span
        className="absolute inset-y-0 left-0"
        style={{
          width: `${Math.max(0, Math.min(100, score))}%`,
          background: seg.replace("%C", TIER_VAR[tier]),
        }}
      />
    </span>
  );
}
