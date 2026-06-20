import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getTrackerItems } from "@/server/queries/opportunities";
import { cn, formatShortDate } from "@/lib/utils";
import { FreshFinds } from "@/components/tracker/fresh-finds";
import { ScoutCard } from "@/components/tracker/scout-card";
import type { IngestionSource } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Radar — Cyclops" };

/**
 * The discovery surface. Two halves:
 *  · Fresh finds + Firm Scout — what the radar surfaced this week, and the
 *    growth loop for adding boutique firms (Scout literally registers a new
 *    monitored source, so it lives here rather than on the tracker grid).
 *  · Source intelligence — every board and careers site we monitor, how it's
 *    read, when it last ran, and what needs attention (watched pages that
 *    changed, sources we currently can't reach, and any disabled feeds).
 */

/** A source whose last run hit a bot challenge / block — reported honestly
 *  rather than silently retried or auto-disabled. */
function isUnreachable(s: IngestionSource): boolean {
  return (s.lastStatus ?? "").toLowerCase().startsWith("unreachable");
}

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

  const needsReview = sources.filter(
    (s) =>
      (s.watchOnly && s.lastChangedAt !== null) ||
      !s.enabled ||
      isUnreachable(s),
  );
  // Every non-watch source is now backed by a live adapter (ATS APIs, public
  // JSON, structured data). Unreachable/disabled ones drop out of "live" and
  // surface under "needs review" instead, so nothing is shown as live when it
  // isn't.
  const liveFeeds = sources.filter(
    (s) => !s.watchOnly && s.enabled && !isUnreachable(s),
  );
  const watchers = sources.filter((s) => s.watchOnly);

  return (
    <div className="animate-rise mx-auto max-w-4xl space-y-5 px-5 py-8">
      <div>
        <p className="label text-faint">Discovery</p>
        <h1 className="mt-1 text-[1.75rem] text-ink">Radar</h1>
        <p className="mt-1 max-w-[62ch] text-[0.875rem] text-muted">
          What the radar surfaced this week, and every board we monitor. Live
          feeds (ATS APIs, public JSON, structured data) publish automatically;
          watched custom sites are diffed for change and flagged for review —
          nothing is scraped or auto-published from them. Sources we can&rsquo;t
          currently reach are flagged, not hidden.
        </p>
      </div>

      {/* Discovery row — fresh finds + the Firm Scout growth loop */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-card border border-border shadow-card">
          <FreshFinds items={items} />
        </div>
        <div className="overflow-hidden rounded-card border border-border shadow-card">
          <ScoutCard />
        </div>
      </div>

      {needsReview.length > 0 && (
        <Section
          title="Needs review"
          glyph="◆"
          glyphTone="text-warning"
          count={needsReview.length}
        >
          {needsReview.map((s) => (
            <SourceRow key={s.id} source={s} highlight />
          ))}
        </Section>
      )}

      <Section
        title="Live feeds"
        glyph="▲"
        glyphTone="text-success"
        count={liveFeeds.length}
      >
        {liveFeeds.length === 0 ? (
          <Empty text="No live feeds registered yet." />
        ) : (
          liveFeeds.map((s) => <SourceRow key={s.id} source={s} />)
        )}
      </Section>

      <Section
        title="Watched sites"
        glyph="◉"
        glyphTone="text-accent"
        count={watchers.length}
      >
        {watchers.length === 0 ? (
          <Empty text="No watched career sites yet — scout a custom careers URL from the tracker." />
        ) : (
          watchers.map((s) => <SourceRow key={s.id} source={s} />)
        )}
      </Section>
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

function modeLabel(s: IngestionSource): string {
  if (s.watchOnly) return "Watch · change detection";
  switch (s.kind) {
    case "GREENHOUSE":
      return "Greenhouse API";
    case "LEVER":
      return "Lever API";
    case "ASHBY":
      return "Ashby API";
    case "WORKDAY":
      return "Workday CXS";
    case "ORACLE_CLOUD":
      return "Oracle Cloud REST";
    case "EIGHTFOLD":
      return "Eightfold API";
    case "AVATURE":
      return "Avature";
    case "RADANCY":
      return "Radancy / TalentBrew";
    case "TALNET":
      return "tal.net board";
    case "CAREERS_PAGE":
      return "Careers site feed";
    default:
      return s.kind;
  }
}

/** Honest per-source health pill — distinguishes "live" from "unreachable"
 *  (bot-challenged) and "disabled", so the board never overstates coverage. */
function HealthPill({ source: s }: { source: IngestionSource }) {
  if (!s.enabled) {
    return <span className="label text-[0.6875rem] text-danger">● disabled</span>;
  }
  if (isUnreachable(s)) {
    return <span className="label text-[0.6875rem] text-warning">● unreachable</span>;
  }
  if (s.watchOnly) {
    return <span className="label text-[0.6875rem] text-accent">● watching</span>;
  }
  if (s.lastSuccessfulFetchAt) {
    return <span className="label text-[0.6875rem] text-success">● live</span>;
  }
  return <span className="label text-[0.6875rem] text-subtle">● not yet run</span>;
}

function SourceRow({
  source: s,
  highlight = false,
}: {
  source: IngestionSource;
  highlight?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5",
        highlight && "bg-accent-tint",
      )}
    >
      <span className="min-w-32 text-[0.88rem] font-semibold text-ink">
        {s.employerName}
      </span>
      <span className="label text-[0.6875rem] text-muted">{modeLabel(s)}</span>
      <HealthPill source={s} />
      <span className="ml-auto flex items-baseline gap-3 text-[0.72rem]">
        <span className="max-w-md truncate text-muted" title={s.lastStatus ?? ""}>
          {s.lastStatus ?? "never run"}
        </span>
        {/* Last successful fetch, shown when it differs from "never" — a source
            can run yet fail, so this is the real "fresh as of" signal. */}
        {s.lastSuccessfulFetchAt && !s.watchOnly && (
          <span className="tabular shrink-0 text-subtle" title="Last successful fetch">
            ok {formatShortDate(s.lastSuccessfulFetchAt)}
          </span>
        )}
        <span className="tabular shrink-0 text-subtle" title="Last run">
          {s.lastRunAt ? formatShortDate(s.lastRunAt) : "—"}
        </span>
      </span>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <li className="px-3 py-4 text-sm text-muted">{text}</li>;
}
