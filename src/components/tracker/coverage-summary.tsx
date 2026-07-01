import type { IngestionSource } from "@prisma/client";
import { cn, formatRelativeTime, formatShortDate } from "@/lib/utils";
import type { RadarCoverage } from "@/lib/radar-feed";

/**
 * Compact coverage summary for the Radar page: ONE muted line of headline
 * numbers, with the full source/health grid tucked behind a native <details>
 * expander so broken/disabled feeds stay reachable without dominating the
 * discovery feed. The grid helpers (Section / SourceRow / HealthPill /
 * modeLabel / Empty) are relocated here unchanged from the old radar page.
 */

/** A source whose last run hit a bot challenge / block — reported honestly
 *  rather than silently retried or auto-disabled. */
function isUnreachable(s: IngestionSource): boolean {
  return (s.lastStatus ?? "").toLowerCase().startsWith("unreachable");
}

export function CoverageSummary({
  coverage,
  sources,
  now,
}: {
  coverage: RadarCoverage;
  sources: IngestionSource[];
  now: Date;
}) {
  const needsReview = sources.filter(
    (s) =>
      (s.watchOnly && s.lastChangedAt !== null) || !s.enabled || isUnreachable(s),
  );
  const liveFeeds = sources.filter(
    (s) => !s.watchOnly && s.enabled && !isUnreachable(s),
  );
  const watchers = sources.filter((s) => s.watchOnly);

  return (
    <div className="space-y-2">
      <p className="text-[0.8125rem] text-muted">
        <span className="label text-faint">Coverage</span>{" "}
        <span className="tabular">{coverage.tracked}</span> firms ·{" "}
        <span className="tabular">{coverage.liveFeeds}</span> live feeds · swept{" "}
        {formatRelativeTime(coverage.lastSweepAt, now)}
        {coverage.needsAttention > 0 && (
          <>
            {" · "}
            <span className="text-warning">
              <span className="tabular">{coverage.needsAttention}</span> need
              attention
            </span>
          </>
        )}
      </p>

      <details className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <summary className="label flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-subtle transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
          Sources ›
        </summary>
        <div className="space-y-3 border-t border-hairline p-3">
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
      </details>
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
