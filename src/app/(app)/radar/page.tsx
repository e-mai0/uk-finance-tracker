import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  getTrackerItems,
  getUserOpportunityIdSets,
} from "@/server/queries/opportunities";
import { composeRadarFeed } from "@/lib/radar-feed";
import { cn, formatRelativeTime, formatShortDate } from "@/lib/utils";
import { Monogram } from "@/components/ui/monogram";
import { ScoutCard } from "@/components/tracker/scout-card";
import { CoverageSummary } from "@/components/tracker/coverage-summary";

/**
 * "What Cyclops did while you were away" (ADR-012): a sync digest headline,
 * the roles that appeared in the window, the roles that closed (marked when
 * they intersect the session user's saved/applied sets), and the compact
 * coverage summary. Closing-soon/opening-soon were dropped — urgency lives on
 * Today and the tracker. All selection logic lives in the pure
 * `composeRadarFeed` module; this is a thin server component that loads data,
 * calls it, and renders.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Radar — Cyclops" };

export default async function RadarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [sources, items, { savedIds, appliedIds }] = await Promise.all([
    prisma.ingestionSource.findMany({
      orderBy: [{ enabled: "desc" }, { employerName: "asc" }],
    }),
    getTrackerItems(userId),
    getUserOpportunityIdSets(userId),
  ]);

  const now = new Date();
  const feed = composeRadarFeed({ items, sources, savedIds, appliedIds, now });
  const { digest, fresh, freshOverflow, recentlyClosed, coverage } = feed;

  const closedYours = recentlyClosed.filter((i) => i.youApplied || i.youSaved);
  const nothingNew = fresh.length === 0;

  return (
    <div className="animate-rise mx-auto max-w-4xl space-y-5 px-5 py-8">
      <div>
        <p className="label text-faint">While you were away</p>
        <h1 className="mt-1 text-[1.75rem] text-ink">Radar</h1>
        {/* Sync digest — every number comes from feed.digest, which is derived
            from the same arrays the sections below render. */}
        <p className="mt-1 text-[0.875rem] text-muted">
          Checked <span className="tabular">{digest.sourcesChecked}</span>{" "}
          {digest.sourcesChecked === 1 ? "source" : "sources"}
          {" · "}
          {digest.lastSyncAt ? (
            <>last sync {formatRelativeTime(digest.lastSyncAt, now)}</>
          ) : (
            <>not yet synced</>
          )}
          {" · "}
          <span className={cn(digest.newCount > 0 && "text-ink")}>
            <span className="tabular">{digest.newCount}</span> new{" "}
            {digest.newCount === 1 ? "role" : "roles"}
          </span>
          {" · "}
          <span className="tabular">{digest.closedCount}</span> closed
        </p>
      </div>

      {/* New — listings first seen this week; overnight finds flagged. A role
          that appeared AND closed within the window stays listed (it did newly
          appear — ADR-012 event semantics) but carries an honest closed glyph.
          When nothing is new, the section is omitted entirely and the single
          all-caught-up card below is the empty state. */}
      {fresh.length > 0 && (
        <Section title="New" glyph="✚" glyphTone="text-success" count={digest.newCount}>
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
                      {i.status === "CLOSED" && (
                        <span className="label shrink-0 text-[0.56rem] font-bold tracking-wider text-faint">
                          closed
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
        </Section>
      )}

      {nothingNew && (
        <p className="rounded-card border border-border bg-surface px-4 py-5 text-center text-[0.875rem] text-muted shadow-card">
          You&rsquo;re all caught up — no new roles this week. Scout a firm below
          to widen the radar; the next sweep runs overnight.
        </p>
      )}

      {/* Closed — collapsed unless one of them is yours (saved/applied). */}
      {recentlyClosed.length > 0 && (
        <details
          open={closedYours.length > 0}
          className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
        >
          <summary className="label flex cursor-pointer list-none items-center gap-1 border-b border-hairline bg-surface-2 px-3 py-2 text-subtle transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
            Closed this week · {recentlyClosed.length}
            {closedYours.length > 0 && (
              <span className="font-bold text-warning">
                {" "}
                · ◆ {closedYours.length} yours
              </span>
            )}{" "}
            ›
          </summary>
          <ul className="divide-y divide-border">
            {recentlyClosed.map((i) => {
              const yours = i.youApplied || i.youSaved;
              return (
                <li
                  key={i.id}
                  className={cn(
                    "flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5",
                    yours && "bg-accent-tint",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted">
                    <span className="font-semibold text-subtle">{i.employerName}</span>{" "}
                    {i.title}
                  </span>
                  {yours && (
                    <span className="label shrink-0 font-bold text-warning">
                      ◆ {i.youApplied ? "you applied to this" : "you saved this"}
                    </span>
                  )}
                  {i.closeReason && (
                    <span className="label shrink-0 text-[0.6875rem] text-faint">
                      {i.closeReason}
                    </span>
                  )}
                  <span className="tabular shrink-0 font-mono text-[0.6875rem] text-faint">
                    {formatShortDate(i.closedAt)}
                  </span>
                </li>
              );
            })}
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
