import type { ProgrammeType } from "@/lib/constants";

export interface InferredDeadline {
  deadlineAt: Date;
  estimated: true;
  isRolling: true;
}

/**
 * Season-aware cycle estimate for a UK finance posting that exposes no real
 * deadline. We only ever fill the gap — a stated deadline always wins upstream
 * (see normalize.ts) and is never touched here. The inferred value is flagged
 * `estimated` + `isRolling` so the UI reads "est. · rolling — may close early"
 * and the status pipeline never treats it as a hard close (see status.ts, which
 * only acts on a non-estimated deadline).
 *
 * The inferred close branches by programme season, because the three UK cycles
 * recruit on different calendars:
 *
 *  - SUMMER_INTERNSHIP — the flagship penultimate-year cycle opens Jul–Sep and
 *    most nominal deadlines cluster by end of November (rolling; many close
 *    earlier once full). We keep the END OF NOVEMBER nominal close that this
 *    module has always used, so summer behaviour does not regress.
 *
 *  - SPRING_WEEK — first-year insight/spring programmes recruit EARLIER than
 *    summer: they open over the late summer/autumn and the bulk of deadlines
 *    fall before the main summer push, rolling through autumn into winter. We
 *    pick END OF OCTOBER of the active cycle as a conservative nominal close —
 *    deliberately earlier than the summer Nov-30 window — and flag it
 *    estimated + rolling. (Amber/judgement: a documented default, not a
 *    per-firm date; spring weeks vary and many genuinely close Oct–Jan.)
 *
 *  - OFF_CYCLE — off-cycle / winter internships are TRULY ROLLING with rolling
 *    or quarterly intakes and NO fixed cohort deadline. Inventing a hard date
 *    here would be false confidence, so we infer NOTHING (return null). The
 *    caller then leaves `deadlineAt` null; the board's deadline column already
 *    collapses a null/estimated/rolling deadline to "Rolling".
 *
 * Per-firm exact dates are NOT hardcoded (the least stable signal); these are
 * honest per-season heuristics applied uniformly, always in the future relative
 * to when the role was first seen.
 */

/** Nominal cycle-close month/day per season (UTC, 0-indexed month). */
const SEASON_CLOSE: Partial<Record<ProgrammeType, { month: number; day: number }>> = {
  // End of November — the long-standing summer heuristic (unchanged).
  SUMMER_INTERNSHIP: { month: 10, day: 30 },
  // End of October — spring weeks recruit earlier than summer.
  SPRING_WEEK: { month: 9, day: 31 },
  // OFF_CYCLE intentionally omitted → rolling, no inferred deadline.
};

/**
 * Infer a cycle close for a posting with no stated deadline.
 * Returns `null` for genuinely rolling seasons (OFF_CYCLE), meaning "no
 * fabricated deadline — leave it rolling".
 */
export function inferDeadline(
  seenAt: Date,
  programmeType: ProgrammeType,
): InferredDeadline | null {
  const window = SEASON_CLOSE[programmeType];
  if (!window) return null; // rolling season (OFF_CYCLE) — do not fabricate a date.

  const year = seenAt.getUTCFullYear();
  let close = new Date(Date.UTC(year, window.month, window.day, 23, 0, 0));
  // If the window has already passed for this year, roll to next cycle.
  if (close.getTime() <= seenAt.getTime()) {
    close = new Date(Date.UTC(year + 1, window.month, window.day, 23, 0, 0));
  }
  return { deadlineAt: close, estimated: true, isRolling: true };
}
