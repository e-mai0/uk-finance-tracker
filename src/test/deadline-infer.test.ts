import { describe, expect, it } from "vitest";
import { inferDeadline } from "../ingestion/deadline-infer";

describe("inferDeadline", () => {
  it("estimates a same-cycle close in the autumn window and flags it", () => {
    // Seen in July 2026 → cycle close ~end of November 2026.
    const now = new Date("2026-07-15T00:00:00Z");
    const r = inferDeadline(now);
    expect(r.estimated).toBe(true);
    expect(r.isRolling).toBe(true);
    expect(r.deadlineAt.getUTCFullYear()).toBe(2026);
    expect(r.deadlineAt.getUTCMonth()).toBe(10); // November (0-indexed)
  });

  it("rolls to next year's close when seen after the window", () => {
    // Seen in December 2026 (window passed) → next close ~end of November 2027.
    const now = new Date("2026-12-20T00:00:00Z");
    const r = inferDeadline(now);
    expect(r.deadlineAt.getUTCFullYear()).toBe(2027);
    expect(r.deadlineAt.getUTCMonth()).toBe(10);
  });

  it("returns a deadline strictly in the future relative to the seen date", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const r = inferDeadline(now);
    expect(r.deadlineAt.getTime()).toBeGreaterThan(now.getTime());
  });
});
