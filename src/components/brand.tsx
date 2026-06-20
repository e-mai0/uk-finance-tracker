import Link from "next/link";
import { cn } from "@/lib/utils";

/** Text-only wordmark — no glyph. A single amber full-stop carries the mark. */
export function Brand({
  href = "/",
  className,
}: {
  href?: string | null;
  className?: string;
}) {
  const inner = (
    <span
      className={cn(
        "text-[1.15rem] font-extrabold tracking-tight text-ink",
        className,
      )}
    >
      Cyclops<span className="text-accent">.</span>
    </span>
  );

  if (!href) return inner;
  return <Link href={href}>{inner}</Link>;
}
