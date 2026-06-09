import { cn } from "@/lib/utils";

/** Faint em-dash for an absent value — recessive, never reads as data. */
export function Dash() {
  return <span className="text-faint">—</span>;
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
