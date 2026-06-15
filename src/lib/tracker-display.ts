import { formatShortDate } from "./utils";

/**
 * How a listing's "Closes" cell reads on the board. A row only shows a real
 * date + countdown when it has a *stated* deadline; everything inferred or
 * rolling collapses to "Rolling", and closed listings read "Closed". This is
 * the single source of truth for the tracker's deadline column so the table
 * and any tests agree.
 */
export type ClosesTone = "soon" | "normal" | "rolling" | "closed";

export interface ClosesInput {
  status: string;
  deadlineAt: string | null;
  /** Deadline inferred from the recruiting cycle, not a stated date. */
  deadlineEstimated: boolean;
  /** Rolling intake — closes when filled, ahead of any date. */
  isRolling: boolean;
  daysLeft: number | null;
}

/** A deadline within this many days is "closing soon" (red ▼ treatment). */
export const CLOSING_SOON_DAYS = 14;

export function describeCloses(r: ClosesInput): { text: string; tone: ClosesTone } {
  if (r.status === "CLOSED") return { text: "Closed", tone: "closed" };

  // A *strict* deadline = a real stated date, not estimated, not rolling, and
  // still in the future. Anything else is reported as rolling.
  const strict =
    !!r.deadlineAt &&
    !r.deadlineEstimated &&
    !r.isRolling &&
    r.daysLeft != null &&
    r.daysLeft >= 0;

  if (strict) {
    const tone: ClosesTone =
      r.daysLeft! <= CLOSING_SOON_DAYS ? "soon" : "normal";
    return { text: `${formatShortDate(r.deadlineAt)} · ${r.daysLeft}d`, tone };
  }

  return { text: "Rolling", tone: "rolling" };
}
