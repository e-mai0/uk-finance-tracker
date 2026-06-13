export interface InferredDeadline {
  deadlineAt: Date;
  estimated: true;
  isRolling: true;
}

/**
 * Cycle-based estimate for UK finance summer internships when the feed exposes
 * no real deadline. The cycle opens Jul–Sep and most nominal deadlines cluster
 * by end of November (rolling — many close earlier once full). We deliberately
 * pick the END OF NOVEMBER of the active cycle as a conservative nominal close,
 * always in the future relative to when the role was first seen, and flag it
 * estimated + rolling so the UI can say "est. · rolling — may close early".
 *
 * Per-bank exact dates are NOT hardcoded (the least stable signal); this is one
 * honest heuristic applied uniformly.
 */
const CLOSE_MONTH = 10; // November (0-indexed)
const CLOSE_DAY = 30;

export function inferDeadline(seenAt: Date): InferredDeadline {
  const year = seenAt.getUTCFullYear();
  let close = new Date(Date.UTC(year, CLOSE_MONTH, CLOSE_DAY, 23, 0, 0));
  // If the window has already passed for this year, roll to next cycle.
  if (close.getTime() <= seenAt.getTime()) {
    close = new Date(Date.UTC(year + 1, CLOSE_MONTH, CLOSE_DAY, 23, 0, 0));
  }
  return { deadlineAt: close, estimated: true, isRolling: true };
}
