import { describe, it, expect } from "vitest";
import { describeCloses, type ClosesInput } from "../lib/tracker-display";
import { formatRelativeTime } from "../lib/utils";

function closes(overrides: Partial<ClosesInput>): ClosesInput {
  return {
    status: "OPEN",
    deadlineAt: "2026-06-30T00:00:00.000Z",
    deadlineEstimated: false,
    isRolling: false,
    daysLeft: 15,
    ...overrides,
  };
}

describe("describeCloses", () => {
  it("shows date + countdown for a real, future, stated deadline", () => {
    expect(describeCloses(closes({ daysLeft: 15 }))).toEqual({
      text: "30 Jun · 15d",
      tone: "normal",
    });
  });

  it("marks a stated deadline within 14 days as closing soon", () => {
    expect(describeCloses(closes({ daysLeft: 1 })).tone).toBe("soon");
    expect(describeCloses(closes({ daysLeft: 14 })).tone).toBe("soon");
    expect(describeCloses(closes({ daysLeft: 15 })).tone).toBe("normal");
  });

  it("reads 'Rolling' when the deadline is only estimated", () => {
    expect(describeCloses(closes({ deadlineEstimated: true }))).toEqual({
      text: "Rolling",
      tone: "rolling",
    });
  });

  it("reads 'Rolling' for explicitly rolling intake even with a date", () => {
    expect(describeCloses(closes({ isRolling: true })).text).toBe("Rolling");
  });

  it("reads 'Rolling' when there is no deadline at all", () => {
    expect(
      describeCloses(closes({ deadlineAt: null, daysLeft: null })).text,
    ).toBe("Rolling");
  });

  it("reads 'Rolling' when a stated deadline has already passed", () => {
    expect(describeCloses(closes({ daysLeft: -3 })).text).toBe("Rolling");
  });

  it("reads 'Closed' for a closed listing regardless of dates", () => {
    expect(describeCloses(closes({ status: "CLOSED", daysLeft: 5 }))).toEqual({
      text: "Closed",
      tone: "closed",
    });
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("returns 'never' for a missing timestamp", () => {
    expect(formatRelativeTime(null, now)).toBe("never");
  });

  it("returns 'just now' under a minute", () => {
    expect(formatRelativeTime("2026-06-15T11:59:30.000Z", now)).toBe("just now");
  });

  it("returns minutes, hours, then days as the gap grows", () => {
    expect(formatRelativeTime("2026-06-15T11:51:00.000Z", now)).toBe("9 min ago");
    expect(formatRelativeTime("2026-06-15T09:00:00.000Z", now)).toBe("3 hr ago");
    expect(formatRelativeTime("2026-06-13T12:00:00.000Z", now)).toBe("2d ago");
  });
});
