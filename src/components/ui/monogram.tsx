import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

/** A small square monogram used in place of employer logos (we don't ship
 *  third-party logos). Deterministic neutral styling. */
export function Monogram({
  name,
  hint,
  className,
}: {
  name: string;
  hint?: string | null;
  className?: string;
}) {
  const label = (hint || initials(name)).slice(0, 3);
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-[0.7rem] font-semibold tracking-tight text-muted",
        className,
      )}
      aria-hidden
    >
      {label}
    </span>
  );
}
