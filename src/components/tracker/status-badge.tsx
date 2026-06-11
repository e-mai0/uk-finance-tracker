import type { OpportunityStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/** Status as colour-coded uppercase text (terminal convention) — not a pill. */
const TONE: Record<OpportunityStatus, string> = {
  OPEN: "text-success",
  OPENING_SOON: "text-warning",
  CLOSED: "text-subtle",
  UNKNOWN: "text-muted",
};

const SHORT: Record<OpportunityStatus, string> = {
  OPEN: "Open",
  OPENING_SOON: "Soon",
  CLOSED: "Closed",
  UNKNOWN: "—",
};

export function StatusBadge({
  status,
  className,
}: {
  status: OpportunityStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular text-[0.72rem] uppercase tracking-wide",
        TONE[status],
        className,
      )}
    >
      {SHORT[status]}
    </span>
  );
}
