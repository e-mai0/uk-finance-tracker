import { describe, expect, it } from "vitest";
import { isOverBudget, dayKey } from "@/server/ai/budget";

describe("budget", () => {
  it("dayKey is UTC YYYY-MM-DD", () => {
    expect(dayKey(new Date("2026-06-09T23:59:00Z"))).toBe("2026-06-09");
  });
  it("over budget when spent >= limit", () => {
    expect(isOverBudget(2_000_000, 2_000_000)).toBe(true);
    expect(isOverBudget(1_999_999, 2_000_000)).toBe(false);
  });
});
