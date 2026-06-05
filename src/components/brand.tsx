import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({
  href = "/",
  className,
}: {
  href?: string | null;
  className?: string;
}) {
  const inner = (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink font-display text-[1.05rem] font-semibold leading-none text-[var(--color-canvas)]">
        T
      </span>
      <span className="font-display text-[1.1rem] font-medium tracking-tight text-ink">
        Trackr
      </span>
    </span>
  );

  if (!href) return inner;
  return <Link href={href}>{inner}</Link>;
}
