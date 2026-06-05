import Link from "next/link";
import type { TrackerItem } from "@/lib/filters";
import { Monogram } from "@/components/ui/monogram";
import { StatusBadge } from "./status-badge";
import { FitPill } from "./fit-pill";
import { SaveButton } from "./save-button";
import { ROLE_FAMILY_SHORT } from "@/lib/constants";
import { cn, formatShortDate, daysUntil } from "@/lib/utils";

const GRID = "grid-cols-[minmax(0,1fr)_7rem_8.5rem_7.5rem_3.5rem_2.5rem]";

export function OpportunityTable({ items }: { items: TrackerItem[] }) {
  if (items.length === 0) return <EmptyState />;

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface">
      {/* Desktop header */}
      <div
        className={cn(
          "hidden gap-3 border-b border-border px-4 py-2.5 text-[0.7rem] font-semibold uppercase tracking-wide text-subtle md:grid",
          GRID,
        )}
      >
        <span>Role</span>
        <span>Location</span>
        <span>Status</span>
        <span>Deadline</span>
        <span className="text-right">Fit</span>
        <span className="sr-only">Save</span>
      </div>

      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id}>
            <Row item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ item }: { item: TrackerItem }) {
  const dl = daysUntil(item.deadlineAt);
  const deadlineSoon = dl !== null && dl >= 0 && dl <= 14;

  return (
    <Link
      href={`/opportunities/${item.id}`}
      className="block px-4 py-3 transition-colors hover:bg-surface-2"
    >
      {/* Desktop grid */}
      <div className={cn("hidden items-center gap-3 md:grid", GRID)}>
        <div className="flex min-w-0 items-center gap-3">
          <Monogram name={item.employerName} hint={item.logoHint} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">
              {item.title}
            </div>
            <div className="truncate text-xs text-muted">
              {item.employerName}
              <span className="text-subtle">
                {" · "}
                {ROLE_FAMILY_SHORT[item.roleFamily]}
                {item.divisionDesk ? ` · ${item.divisionDesk}` : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="truncate text-sm text-muted">{item.location}</div>
        <div>
          <StatusBadge status={item.status} />
        </div>
        <div className="text-sm">
          {item.deadlineAt ? (
            <span
              className={cn(
                "tabular",
                deadlineSoon ? "font-medium text-warning" : "text-muted",
              )}
            >
              {formatShortDate(item.deadlineAt)}
              {deadlineSoon && (
                <span className="ml-1 text-xs">
                  · {dl === 0 ? "today" : `${dl}d`}
                </span>
              )}
            </span>
          ) : (
            <span className="text-subtle">—</span>
          )}
        </div>
        <div className="flex justify-end">
          <FitPill score={item.score} />
        </div>
        <div className="flex justify-end">
          <SaveButton
            opportunityId={item.id}
            initialSaved={!!item.saved}
          />
        </div>
      </div>

      {/* Mobile card */}
      <div className="md:hidden">
        <div className="flex items-start gap-3">
          <Monogram name={item.employerName} hint={item.logoHint} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">
                  {item.title}
                </div>
                <div className="truncate text-xs text-muted">
                  {item.employerName} · {item.location}
                </div>
              </div>
              <FitPill score={item.score} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge status={item.status} />
              {item.deadlineAt && (
                <span
                  className={cn(
                    "text-xs tabular",
                    deadlineSoon ? "font-medium text-warning" : "text-subtle",
                  )}
                >
                  Closes {formatShortDate(item.deadlineAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-6 py-16 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-subtle">
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="9" cy="9" r="6" />
          <path d="M14 14l3 3" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-ink">No roles match</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        Try clearing a filter or broadening your search to see more
        opportunities.
      </p>
    </div>
  );
}
