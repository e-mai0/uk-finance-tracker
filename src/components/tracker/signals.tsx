import { cn, daysUntil } from "@/lib/utils";

/** Faint em-dash for an absent value — recessive, never reads as data. */
export function Dash() {
  return <span className="text-faint">—</span>;
}

const NEW_WINDOW_DAYS = 7;

/** True when a listing was first seen within the last week — the window the
 *  Fresh-finds rail uses, so "new" means the same thing everywhere. */
export function isFreshListing(
  firstSeenAt: Date | string,
  now: Date = new Date(),
): boolean {
  const age = daysUntil(firstSeenAt, now); // ≤ 0 when in the past
  return age !== null && age <= 0 && age >= -NEW_WINDOW_DAYS;
}

/** Compact "NEW" marker for listings first seen within the last week, so
 *  radar/scout discoveries stand out in the dense grid. */
export function NewFlag({
  firstSeenAt,
  className,
}: {
  firstSeenAt: Date | string;
  className?: string;
}) {
  if (!isFreshListing(firstSeenAt)) return null;
  return (
    <span
      className={cn(
        "label shrink-0 text-[0.56rem] font-bold tracking-wider text-success",
        className,
      )}
    >
      ●&#8201;NEW
    </span>
  );
}

/** Days-left as a colour-coded countdown: red ≤7, amber ≤14, else subtle.
 *  Shared by the opportunity table and the watchlist so the deadline-pressure
 *  signal reads identically in both. Pass `className` to set the type size. */
export function DaysLeft({
  dl,
  className,
}: {
  dl: number | null;
  className?: string;
}) {
  if (dl == null || dl < 0)
    return <span className={cn("tabular text-faint", className)}>—</span>;
  const cls =
    dl <= 7 ? "text-danger" : dl <= 14 ? "text-warning" : "text-subtle";
  return (
    <span className={cn("tabular font-semibold", cls, className)}>
      {dl === 0 ? "0d" : `${dl}d`}
    </span>
  );
}
