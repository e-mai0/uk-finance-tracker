import Link from "next/link";
import type { TrackerItem } from "@/lib/filters";
import { StatusBadge } from "./status-badge";
import { FitPill } from "./fit-pill";
import { SaveButton } from "./save-button";
import { ROLE_FAMILY_SHORT } from "@/lib/constants";
import { cn, formatShortDate, daysUntil, ticker, locCode } from "@/lib/utils";
import { DaysLeft, Dash } from "./signals";

// # · CODE · FIRM/ROLE · DIV · LOC · DEADLINE · DAYS · FIT(+bar) · STATUS · SAVE
const GRID =
  "grid-cols-[2.25rem_3.75rem_minmax(0,1fr)_3.5rem_3rem_5rem_2.75rem_3.25rem_4.5rem_2.25rem]";

// Faint vertical cell rules give the true terminal grid; first cell has none.
const CELL = "px-2.5 border-l border-border/55 [&:first-child]:border-l-0";

/** Flat, gridlined data grid — no card/shadow/rounding. Fills its container;
 *  the desk frame supplies the outer borders. */
export function OpportunityTable({ items }: { items: TrackerItem[] }) {
  if (items.length === 0) return <EmptyState />;

  return (
    <div className="bg-surface">
      {/* Sticky column header (pins beneath the command bar) */}
      <div
        className={cn(
          "label sticky top-11 z-10 hidden border-b border-border-strong bg-surface-2 text-[0.62rem] text-subtle md:grid",
          GRID,
        )}
      >
        <span className={cn(CELL, "py-2 text-right")}>#</span>
        <span className={cn(CELL, "py-2")}>Code</span>
        <span className={cn(CELL, "py-2")}>Firm / Role</span>
        <span className={cn(CELL, "py-2")}>Div</span>
        <span className={cn(CELL, "py-2")}>Loc</span>
        <span className={cn(CELL, "py-2")}>Deadline</span>
        <span className={cn(CELL, "py-2 text-right")}>Days</span>
        <span className={cn(CELL, "py-2")}>Fit</span>
        <span className={cn(CELL, "py-2 text-right")}>Status</span>
        <span className={cn(CELL, "py-2 sr-only")}>Save</span>
      </div>

      <ul>
        {items.map((item, i) => (
          <li key={item.id}>
            <Row item={item} index={i + 1} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ item, index }: { item: TrackerItem; index: number }) {
  const dl = daysUntil(item.deadlineAt);
  const closed = item.status === "CLOSED";

  return (
    <Link
      href={`/opportunities/${item.id}`}
      className={cn(
        "group block border-b border-l-2 border-transparent border-b-border transition-colors hover:border-l-accent hover:bg-accent-tint",
        closed && "opacity-55",
      )}
    >
      {/* Desktop grid row */}
      <div className={cn("hidden items-stretch md:grid", GRID)}>
        <span className={cn(CELL, "flex items-center justify-end py-2")}>
          <span className="tabular text-[0.72rem] text-faint">
            {String(index).padStart(2, "0")}
          </span>
        </span>

        <span className={cn(CELL, "flex items-center py-2")}>
          <span className="tabular truncate text-[0.86rem] font-bold tracking-tight text-accent">
            {ticker(item.employerName)}
          </span>
        </span>

        <span className={cn(CELL, "flex min-w-0 items-baseline gap-2 py-2")}>
          <span className="truncate text-[0.9rem] font-semibold text-ink">
            {item.employerName}
          </span>
          <span className="truncate text-[0.8rem] text-muted">
            {item.title}
          </span>
        </span>

        <span className={cn(CELL, "flex items-center py-2")}>
          <span className="label text-[0.62rem] text-muted">
            {ROLE_FAMILY_SHORT[item.roleFamily]}
          </span>
        </span>

        <span className={cn(CELL, "flex items-center py-2")}>
          <span className="tabular text-[0.78rem] text-muted">
            {locCode(item.location)}
          </span>
        </span>

        <span className={cn(CELL, "flex items-center py-2")}>
          <span className="tabular text-[0.78rem] text-ink">
            {item.deadlineAt ? formatShortDate(item.deadlineAt) : <Dash />}
          </span>
        </span>

        <span className={cn(CELL, "flex items-center justify-end py-2")}>
          <DaysLeft dl={dl} className="text-[0.78rem]" />
        </span>

        <span className={cn(CELL, "flex items-center py-2")}>
          <FitPill score={item.score} className="text-[1rem] font-bold" />
        </span>

        <span className={cn(CELL, "flex items-center justify-end py-2")}>
          <StatusBadge status={item.status} />
        </span>

        <span className={cn(CELL, "flex items-center justify-end py-1")}>
          <SaveButton opportunityId={item.id} initialSaved={!!item.saved} />
        </span>
      </div>

      {/* Mobile row */}
      <div className="px-3 py-2.5 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="tabular shrink-0 text-[0.82rem] font-bold text-accent">
              {ticker(item.employerName)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[0.92rem] font-semibold text-ink">
                {item.employerName}
              </span>
              <span className="block truncate text-[0.8rem] text-muted">
                {item.title}
              </span>
            </span>
          </div>
          <FitPill score={item.score} className="text-[1.05rem] font-bold" />
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
          <StatusBadge status={item.status} />
          <span className="tabular">{locCode(item.location)}</span>
          {item.deadlineAt && (
            <span className="tabular">
              {formatShortDate(item.deadlineAt)}
              {dl != null && dl >= 0 && (
                <span className="ml-1 text-subtle">· {dl}d</span>
              )}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border-strong bg-surface px-6 py-16 text-center">
      <div className="label text-subtle">No matching positions</div>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
        Clear a filter or broaden your search to bring more roles onto the tape.
      </p>
    </div>
  );
}
