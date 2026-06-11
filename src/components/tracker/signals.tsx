import { cn, daysUntil } from "@/lib/utils";

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
