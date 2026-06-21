import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getTrackerItems } from "@/server/queries/opportunities";
import { composeRadarFeed } from "@/lib/radar-feed";
import { cn, daysUntil, formatShortDate } from "@/lib/utils";
import { Monogram } from "@/components/ui/monogram";
import { ScoutCard } from "@/components/tracker/scout-card";
import { CoverageSummary } from "@/components/tracker/coverage-summary";
import type { TrackerItem } from "@/lib/filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Radar — Cyclops" };

/**
 * The discovery surface: a "what changed overnight / this week" feed — roles
 * closing soon, newly seen, opening soon, and recently closed — with the
 * source/health grid demoted into a compact, expandable coverage summary. All
 * the selection logic lives in the pure `composeRadarFeed` module; this is a
 * thin server component that loads data, calls it, and renders.
 */

export default async function RadarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [sources, items] = await Promise.all([
    prisma.ingestionSource.findMany({
      orderBy: [{ enabled: "desc" }, { employerName: "asc" }],
    }),
    getTrackerItems(userId),
  ]);

  const now = new Date();
  const feed = composeRadarFeed({ items, sources, now });
  const { closingSoon, fresh, freshOverflow, openingSoon, recentlyClosed, coverage } =
    feed;

  const newThisWeek = fresh.length + freshOverflow;
  const nothingNew =
    closingSoon.length === 0 && fresh.length === 0 && openingSoon.length === 0;

  return (
    <div className="animate-rise mx-auto max-w-4xl space-y-5 px-5 py-8">
      <div>
        <p className="label text-faint">Discovery</p>
        <h1 className="mt-1 text-[1.75rem] text-ink">Radar</h1>
        <p className="mt-1 text-[0.875rem] text-muted">
          {newThisWeek > 0
            ? `${newThisWeek} new this week`
            : "Nothing new this week"}
          {coverage.lastSweepAt && (
            <>
              {" · "}
              <span className="text-subtle">
                swept {formatShortDate(coverage.lastSweepAt)}
              </span>
            </>
          )}
        </p>
      </div>

      {/* Closing soon — strongest weight; stated deadlines only. */}
      {closingSoon.length > 0 && (
        <Section title="Closing soon" glyph="▼" glyphTone="text-danger" count={closingSoon.length}>
          {closingSoon.map((i) => {
            const d = daysUntil(i.deadlineAt, now);
            const urgent = d !== null && d <= 14;
            return (
              <li key={i.id}>
                <Link
                  href={`/tracker/${i.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <Monogram name={i.employerName} hint={i.logoHint} className="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] font-bold text-ink">
                      {i.employerName}
                    </p>
                    <p className="truncate text-[0.8125rem] text-muted">{i.title}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("font-mono text-[0.78rem]", urgent ? "text-danger" : "text-ink")}>
                      {urgent && <span aria-hidden>▼ </span>}D-{d}
                    </p>
                    <p className="font-mono text-[0.6875rem] text-subtle">
                      {formatShortDate(i.deadlineAt)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </Section>
      )}

      {/* New — listings first seen this week; overnight finds flagged. */}
      <Section title="New" glyph="✚" glyphTone="text-success" count={newThisWeek}>
        {fresh.length === 0 ? (
          <li className="px-3 py-4 text-[0.8125rem] text-muted">
            No new listings this week. Scout a firm below to widen the radar.
          </li>
        ) : (
          <>
            {fresh.map((i) => (
              <li key={i.id}>
                <Link
                  href={`/tracker/${i.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <Monogram name={i.employerName} hint={i.logoHint} className="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-[0.875rem] font-bold text-ink">
                        {i.employerName}
                      </p>
                      {i.isOvernight && (
                        <span className="label shrink-0 text-[0.56rem] font-bold tracking-wider text-success">
                          ●&#8201;new
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[0.8125rem] text-muted">{i.title}</p>
                  </div>
                  <span className="tabular shrink-0 font-mono text-[0.6875rem] text-subtle">
                    {formatShortDate(i.firstSeenAt)}
                  </span>
                </Link>
              </li>
            ))}
            {freshOverflow > 0 && (
              <li>
                <Link
                  href="/tracker?sort=recently_seen"
                  className="label flex items-center px-3 py-2.5 text-subtle transition-colors hover:text-ink"
                >
                  +{freshOverflow} more →
                </Link>
              </li>
            )}
          </>
        )}
      </Section>

      {/* Opening soon — firms with a stated open date ahead. */}
      {openingSoon.length > 0 && (
        <Section title="Opening soon" glyph="◆" glyphTone="text-accent" count={openingSoon.length}>
          {openingSoon.map((i) => (
            <li key={i.id}>
              <Link
                href={`/tracker/${i.id}`}
                className="flex items-baseline gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink">
                  <span className="font-bold">{i.employerName}</span>{" "}
                  <span className="text-muted">{i.title}</span>
                </span>
                <span className="tabular shrink-0 font-mono text-[0.72rem] text-subtle">
                  {i.opensAt ? `opens ${formatShortDate(i.opensAt)}` : "—"}
                </span>
              </Link>
            </li>
          ))}
        </Section>
      )}

      {nothingNew && (
        <p className="rounded-card border border-border bg-surface px-4 py-5 text-center text-[0.875rem] text-muted shadow-card">
          You&rsquo;re all caught up — no new roles this week. The next sweep runs
          overnight.
        </p>
      )}

      {/* Recently closed — collapsed, never highlighted. */}
      {recentlyClosed.length > 0 && (
        <details className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
          <summary className="label flex cursor-pointer list-none items-center gap-1 border-b border-hairline bg-surface-2 px-3 py-2 text-subtle transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
            Recently closed · {recentlyClosed.length} ›
          </summary>
          <ul className="divide-y divide-border">
            {recentlyClosed.map((i: TrackerItem) => (
              <li key={i.id} className="flex items-baseline gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted">
                  <span className="font-semibold text-subtle">{i.employerName}</span>{" "}
                  {i.title}
                </span>
                {i.closeReason && (
                  <span className="label shrink-0 text-[0.6875rem] text-faint">
                    {i.closeReason}
                  </span>
                )}
                <span className="tabular shrink-0 font-mono text-[0.6875rem] text-faint">
                  {formatShortDate(i.closedAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Coverage summary + the Firm Scout growth loop, demoted below the feed. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,18rem)]">
        <CoverageSummary coverage={coverage} sources={sources} now={now} />
        <div className="overflow-hidden rounded-card border border-border shadow-card">
          <ScoutCard />
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  glyph,
  glyphTone,
  count,
  children,
}: {
  title: string;
  glyph: string;
  glyphTone: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-hairline bg-surface-2 px-3 py-2">
        <span className="label text-ink">
          <span className={glyphTone}>{glyph}</span> {title}
        </span>
        <span className="tabular label text-faint">{count}</span>
      </div>
      <ul className="divide-y divide-border">{children}</ul>
    </div>
  );
}
