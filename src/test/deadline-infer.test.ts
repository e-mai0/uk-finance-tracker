import { describe, expect, it } from "vitest";
import { inferDeadline } from "../ingestion/deadline-infer";

describe("inferDeadline — SUMMER_INTERNSHIP (unchanged heuristic)", () => {
  it("estimates a same-cycle close in the autumn window and flags it", () => {
    // Seen in July 2026 → cycle close ~end of November 2026.
    const now = new Date("2026-07-15T00:00:00Z");
    const r = inferDeadline(now, "SUMMER_INTERNSHIP");
    expect(r).not.toBeNull();
    expect(r!.estimated).toBe(true);
    expect(r!.isRolling).toBe(true);
    expect(r!.deadlineAt.getUTCFullYear()).toBe(2026);
    expect(r!.deadlineAt.getUTCMonth()).toBe(10); // November (0-indexed)
  });

  it("rolls to next year's close when seen after the window", () => {
    // Seen in December 2026 (window passed) → next close ~end of November 2027.
    const now = new Date("2026-12-20T00:00:00Z");
    const r = inferDeadline(now, "SUMMER_INTERNSHIP");
    expect(r!.deadlineAt.getUTCFullYear()).toBe(2027);
    expect(r!.deadlineAt.getUTCMonth()).toBe(10);
  });

  it("returns a deadline strictly in the future relative to the seen date", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const r = inferDeadline(now, "SUMMER_INTERNSHIP");
    expect(r!.deadlineAt.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("inferDeadline — SPRING_WEEK (earlier window than summer)", () => {
  it("infers an end-of-October close, earlier than the summer Nov-30 window", () => {
    // Seen in August 2026 → spring close ~end of October 2026.
    const now = new Date("2026-08-15T00:00:00Z");
    const spring = inferDeadline(now, "SPRING_WEEK");
    expect(spring).not.toBeNull();
    expect(spring!.estimated).toBe(true);
    expect(spring!.isRolling).toBe(true);
    expect(spring!.deadlineAt.getUTCFullYear()).toBe(2026);
    expect(spring!.deadlineAt.getUTCMonth()).toBe(9); // October (0-indexed)

    // And it must be strictly earlier than the summer inference for the same seen date.
    const summer = inferDeadline(now, "SUMMER_INTERNSHIP");
    expect(spring!.deadlineAt.getTime()).toBeLessThan(summer!.deadlineAt.getTime());
  });

  it("rolls to next year's October when seen after the window", () => {
    // Seen in November 2026 (Oct window passed) → next close ~end of October 2027.
    const now = new Date("2026-11-10T00:00:00Z");
    const r = inferDeadline(now, "SPRING_WEEK");
    expect(r!.deadlineAt.getUTCFullYear()).toBe(2027);
    expect(r!.deadlineAt.getUTCMonth()).toBe(9); // October
  });

  it("returns a deadline strictly in the future relative to the seen date", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const r = inferDeadline(now, "SPRING_WEEK");
    expect(r!.deadlineAt.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("inferDeadline — OFF_CYCLE (rolling, no fabricated deadline)", () => {
  it("returns null instead of inventing a hard deadline", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    expect(inferDeadline(now, "OFF_CYCLE")).toBeNull();
  });

  it("returns null regardless of when the role was seen", () => {
    expect(inferDeadline(new Date("2026-01-05T00:00:00Z"), "OFF_CYCLE")).toBeNull();
    expect(inferDeadline(new Date("2026-12-31T00:00:00Z"), "OFF_CYCLE")).toBeNull();
  });
});

describe("inferDeadline — determinism", () => {
  it("is pure: same inputs yield equal output", () => {
    const now = new Date("2026-08-20T00:00:00Z");
    const a = inferDeadline(now, "SPRING_WEEK");
    const b = inferDeadline(now, "SPRING_WEEK");
    expect(a!.deadlineAt.getTime()).toBe(b!.deadlineAt.getTime());
  });
});
