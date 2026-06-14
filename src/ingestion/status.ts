import type { OpportunityStatus } from "@prisma/client";

const CLOSE_AFTER_MISSES = 2;

export interface ExistingRole {
  key: string; // employer+title+location dedup key
  status: OpportunityStatus;
  consecutiveMisses: number;
  deadlineAt: Date | null;
  deadlineEstimated: boolean;
}

export interface Transition {
  key: string;
  status: OpportunityStatus;
  consecutiveMisses: number;
  closeReason?: string;
}

/**
 * Decide status transitions for one (employer, sourceType) cohort. Pure.
 * - Unhealthy fetch → no transitions at all (the false-closure guard).
 * - Present + passed REAL deadline → CLOSED(deadline_passed).
 * - Present otherwise → reopen if it was closed; reset misses.
 * - Absent from a healthy feed → increment misses; CLOSED(absent_debounce) at threshold.
 * Returns only rows that actually change.
 */
export function decideTransitions(
  existing: ExistingRole[],
  presentKeys: Set<string>,
  healthy: boolean,
  now: Date,
): Transition[] {
  if (!healthy) return [];
  const out: Transition[] = [];
  for (const r of existing) {
    const present = presentKeys.has(r.key);
    if (present) {
      const deadlinePassed =
        r.deadlineAt !== null && !r.deadlineEstimated && r.deadlineAt.getTime() < now.getTime();
      if (deadlinePassed && r.status !== "CLOSED") {
        out.push({ key: r.key, status: "CLOSED", consecutiveMisses: 0, closeReason: "deadline_passed" });
        continue;
      }
      if (deadlinePassed) continue; // already closed
      if (r.status === "CLOSED" || r.consecutiveMisses !== 0) {
        out.push({ key: r.key, status: "OPEN", consecutiveMisses: 0 });
      }
      continue;
    }
    // Absent
    if (r.status === "CLOSED") continue; // already closed, nothing to do
    const misses = r.consecutiveMisses + 1;
    if (misses >= CLOSE_AFTER_MISSES) {
      out.push({ key: r.key, status: "CLOSED", consecutiveMisses: misses, closeReason: "absent_debounce" });
    } else {
      out.push({ key: r.key, status: "OPEN", consecutiveMisses: misses });
    }
  }
  return out;
}
