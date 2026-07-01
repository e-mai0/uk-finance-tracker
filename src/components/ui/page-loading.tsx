import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shared, on-brand route-loading skeleton (GB+; no icons — typographic glyphs
 * only). Rendered by per-route `loading.tsx` files so App Router navigation
 * shows an instant skeleton instead of a blank/janky wait while a server
 * component streams in.
 *
 * Deliberately generic: it does not pixel-match each page's content (a tasteful
 * placeholder is enough for beta). Matches the common page wrapper used across
 * the (app) routes (`mx-auto max-w-3xl px-5 py-8` + `animate-rise`).
 *
 * Static + declarative → safe to render as a server component.
 */
export function PageLoading({
  className,
  rows = 6,
}: {
  className?: string;
  rows?: number;
}) {
  return (
    <div
      className={cn("animate-rise mx-auto max-w-3xl px-5 py-8", className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>

      {/* Eyebrow + title — mirrors the page-header rhythm. */}
      <Skeleton className="h-3 w-24" aria-hidden />
      <Skeleton className="mt-2 h-7 w-56" aria-hidden />

      {/* Content rows — a clean placeholder list. */}
      <div
        className="mt-6 overflow-hidden rounded-card border border-border bg-surface"
        aria-hidden
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-hairline px-4 py-3.5 last:border-0"
          >
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
