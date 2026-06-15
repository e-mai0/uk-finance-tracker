"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, formatRelativeTime } from "@/lib/utils";
import { describeCloses, type ClosesTone } from "@/lib/tracker-display";
import type {
  BoardRow,
  BoardListingRow,
  BoardTrackedRow,
  BoardStats,
} from "@/lib/tracker-board";
import { toggleSave } from "@/server/actions/saved";

export type {
  BoardRow,
  BoardListingRow,
  BoardTrackedRow,
  BoardStats,
} from "@/lib/tracker-board";

const FIT = {
  strong: "var(--color-tier-strong)",
  good: "var(--color-tier-good)",
  mod: "var(--color-tier-mod)",
  low: "var(--color-tier-low)",
} as const;

function fitColor(score: number | undefined): string {
  if (score == null) return FIT.low;
  if (score >= 75) return FIT.strong;
  if (score >= 50) return FIT.good;
  if (score >= 25) return FIT.mod;
  return FIT.low;
}

function monogram(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}

const CLOSES_TONE: Record<ClosesTone, string> = {
  soon: "text-danger",
  normal: "text-muted",
  rolling: "text-subtle",
  closed: "text-faint",
};

type Tier = "live" | "closed" | "tracked";
function tierOf(row: BoardRow): Tier {
  if (row.kind === "tracked") return "tracked";
  return row.status === "CLOSED" ? "closed" : "live";
}
const TIER_HEADING: Partial<Record<Tier, string>> = {
  closed: "Closed",
  tracked: "Opening soon",
};

export function Board({ rows, stats }: { rows: BoardRow[]; stats: BoardStats }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const rowH = "h-[2.125rem]"; // compact, always

  let prevTier: Tier | null = null;

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-strong bg-surface-3 text-left">
            <th scope="col" className="label w-9 px-4 py-1.5 text-faint" aria-label="Monogram" />
            <th scope="col" className="label py-1.5 text-faint">Firm · Role</th>
            <th scope="col" className="label w-24 py-1.5 text-right text-faint">Closes</th>
            <th scope="col" className="label w-28 py-1.5 text-right text-faint">Fit</th>
            <th scope="col" className="label w-20 px-4 py-1.5 text-right text-faint">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tier = tierOf(row);
            const heading = tier !== prevTier ? TIER_HEADING[tier] : undefined;
            prevTier = tier;

            return (
              <RowGroup key={`${row.kind}:${row.id}`} heading={heading}>
                {row.kind === "tracked" ? (
                  <TrackedRow row={row} rowH={rowH} />
                ) : (
                  <ListingRow
                    row={row}
                    rowH={rowH}
                    onOpen={() => router.push(`/tracker/${row.id}`)}
                    onSave={() => startTransition(() => void toggleSave(row.id))}
                    onAsk={() => router.push(`/chat?opportunity=${row.id}`)}
                  />
                )}
              </RowGroup>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-2 border-t border-hairline px-4 py-2">
        <span className="label tabular text-faint">
          <span className="text-subtle">{stats.tracked}</span> firms tracked
          {" · "}
          <span className="text-subtle">{stats.live}</span> live
          {" · "}
          <span className="text-subtle">{stats.closingThisWeek}</span> closing this week
        </span>
        <span className="label tabular ml-auto flex items-center gap-1.5 text-faint">
          {stats.lastSyncAt ? (
            <>
              <span
                aria-hidden
                className="live-dot inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--color-good-mark)" }}
              />
              synced {formatRelativeTime(stats.lastSyncAt)}
            </>
          ) : (
            <>sync pending</>
          )}
        </span>
      </div>
    </div>
  );
}

function RowGroup({
  heading,
  children,
}: {
  heading?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {heading && (
        <tr>
          <td colSpan={5} className="border-b border-hairline bg-surface-3 px-4 py-1">
            <span className="label text-faint">{heading}</span>
          </td>
        </tr>
      )}
      {children}
    </>
  );
}

function FirmRole({
  employer,
  detail,
  detailClass,
  firmClass,
  children,
}: {
  employer: string;
  detail: string;
  detailClass: string;
  firmClass: string;
  children?: React.ReactNode;
}) {
  // Single horizontal line, vertically centered against the monogram.
  return (
    <span className="flex min-w-0 items-center">
      <span className="truncate">
        <span className={cn("text-[0.8125rem] font-extrabold", firmClass)}>{employer}</span>
        <span className={cn("text-[0.75rem] font-bold", detailClass)}>{detail}</span>
      </span>
      {children}
    </span>
  );
}

function Mono({ label, agent }: { label: string; agent?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "tabular flex h-5 w-5 items-center justify-center rounded-sm border text-[0.6875rem]",
        agent
          ? "border-border-agent bg-accent-soft text-accent"
          : "border-border bg-surface-2 text-subtle",
      )}
    >
      {label}
    </span>
  );
}

function ListingRow({
  row,
  rowH,
  onOpen,
  onSave,
  onAsk,
}: {
  row: BoardListingRow;
  rowH: string;
  onOpen: () => void;
  onSave: () => void;
  onAsk: () => void;
}) {
  const closed = row.status === "CLOSED";
  const closes = describeCloses(row);

  return (
    <tr
      onClick={onOpen}
      className={cn(
        "group cursor-pointer border-b border-hairline align-middle transition-colors hover:bg-surface-2",
        rowH,
        row.agentTags.length > 0 &&
          "bg-accent-tint shadow-[inset_3px_0_0_var(--color-agent-mark)]",
      )}
    >
      <td className="px-4 align-middle">
        <Mono label={monogram(row.employerName)} agent={row.agentTags.length > 0} />
      </td>
      <td className="max-w-0 truncate pr-3 align-middle">
        <a
          href={`/tracker/${row.id}`}
          className="focus-visible:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <FirmRole
            employer={row.employerName}
            detail={`${" · "}${row.title}${row.divisionDesk ? ` · ${row.divisionDesk}` : ""}`}
            firmClass={closed ? "text-subtle" : "text-ink"}
            detailClass={closed ? "text-faint" : "text-subtle"}
          >
            {row.agentTags.map((tag) => (
              <span
                key={`${tag.kind}:${tag.title}`}
                className="label ml-2 shrink-0 rounded-pill border border-border-agent bg-accent-soft px-1.5 text-accent"
              >
                <span aria-hidden>{tag.kind === "FLAG" ? "▲ " : "◆ "}</span>
                <span className="sr-only">{tag.kind === "FLAG" ? "deadline flag: " : "Cyclops: "}</span>
                {tag.title}
              </span>
            ))}
            {row.fresh && <span className="label ml-2 shrink-0 text-success">NEW</span>}
            {row.saved && (
              <span className="ml-2 shrink-0 text-[0.75rem] text-warning">
                <span aria-hidden>★</span>
                <span className="sr-only">saved</span>
              </span>
            )}
          </FirmRole>
        </a>
      </td>
      <td className="py-0 text-right align-middle">
        <span className={cn("tabular text-[0.75rem]", CLOSES_TONE[closes.tone])}>
          {closes.tone === "soon" && <span aria-hidden>▼ </span>}
          {closes.text}
        </span>
      </td>
      <td className="text-right align-middle">
        <span className="inline-flex items-center justify-end gap-2">
          <span aria-hidden className="relative inline-block h-1.5 w-10 overflow-hidden rounded-bar bg-surface-3">
            <span
              className="absolute inset-y-0 left-0 rounded-bar"
              style={{ width: `${row.score ?? 0}%`, background: fitColor(row.score) }}
            />
          </span>
          <span className="tabular w-6 text-right text-[0.75rem]" style={{ color: fitColor(row.score) }}>
            {row.score ?? "—"}
          </span>
        </span>
      </td>
      <td className="px-4 text-right align-middle">
        <span className="relative inline-block">
          <span
            className={cn(
              "label",
              closed ? "text-faint" : "text-muted",
              "group-hover:opacity-0 group-focus-within:opacity-0",
            )}
          >
            {row.status === "OPEN" ? "OPEN" : row.status === "OPENING_SOON" ? "SOON" : closed ? "CLOSED" : "—"}
          </span>
          {/* Row actions: always in DOM, shown on hover/focus (a11y rule). */}
          <span className="absolute inset-y-0 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              aria-label={row.saved ? "Unsave" : "Save"}
              onClick={(e) => {
                e.stopPropagation();
                onSave();
              }}
              className="label min-h-6 rounded-pill border border-border bg-surface px-2 text-subtle hover:border-border-interactive hover:text-ink"
            >
              ★
            </button>
            <button
              type="button"
              aria-label="Ask Cyclops about this listing"
              onClick={(e) => {
                e.stopPropagation();
                onAsk();
              }}
              className="label min-h-6 rounded-pill border border-border bg-surface px-2 text-subtle hover:border-agent-mark hover:text-accent"
            >
              ◆
            </button>
          </span>
        </span>
      </td>
    </tr>
  );
}

function TrackedRow({ row, rowH }: { row: BoardTrackedRow; rowH: string }) {
  // Same table style as a live row — just no role, deadline, or fit yet, and
  // not clickable (no listing detail to open).
  return (
    <tr className={cn("border-b border-hairline align-middle", rowH)}>
      <td className="px-4 align-middle">
        <Mono label={monogram(row.employerName)} />
      </td>
      <td className="max-w-0 truncate pr-3 align-middle">
        <FirmRole employer={row.employerName} detail="" firmClass="text-ink" detailClass="text-subtle" />
      </td>
      <td className="py-0 text-right align-middle">
        <span className="tabular text-[0.75rem] text-faint">—</span>
      </td>
      <td className="text-right align-middle">
        <span className="tabular text-[0.75rem] text-faint">—</span>
      </td>
      <td className="px-4 text-right align-middle">
        <span className="label text-muted">SOON</span>
      </td>
    </tr>
  );
}
