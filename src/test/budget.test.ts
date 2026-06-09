import { describe, expect, it } from "vitest";
import { isOverBudget, dayKey, dailyLimit } from "@/server/ai/budget";

describe("budget", () => {
  it("dayKey is UTC YYYY-MM-DD", () => {
    expect(dayKey(new Date("2026-06-09T23:59:00Z"))).toBe("2026-06-09");
  });
  it("over budget when spent >= limit", () => {
    expect(isOverBudget(2_000_000, 2_000_000)).toBe(true);
    expect(isOverBudget(1_999_999, 2_000_000)).toBe(false);
  });
  it("dailyLimit returns 2_000_000 when env is unset", () => {
    const original = process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
    delete process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
    expect(dailyLimit()).toBe(2_000_000);
    if (original !== undefined) process.env.CYCLOPS_DAILY_TOKEN_BUDGET = original;
  });
  it("dailyLimit returns 2_000_000 for non-numeric env value (fail-closed)", () => {
    const original = process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
    process.env.CYCLOPS_DAILY_TOKEN_BUDGET = "garbage";
    expect(dailyLimit()).toBe(2_000_000);
    if (original !== undefined) process.env.CYCLOPS_DAILY_TOKEN_BUDGET = original;
    else delete process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
  });
  it("dailyLimit respects a valid numeric env value", () => {
    const original = process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
    process.env.CYCLOPS_DAILY_TOKEN_BUDGET = "500000";
    expect(dailyLimit()).toBe(500_000);
    if (original !== undefined) process.env.CYCLOPS_DAILY_TOKEN_BUDGET = original;
    else delete process.env.CYCLOPS_DAILY_TOKEN_BUDGET;
  });
});
