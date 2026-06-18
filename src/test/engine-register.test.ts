import { describe, expect, it } from "vitest";
import { inferRegister } from "@/server/engine/register";

describe("inferRegister — programme", () => {
  const cases: [string, string | undefined, string][] = [
    // spring week signals
    ["Spring Week Insight Programme", undefined, "spring_week"],
    ["Spring Insight 2026", undefined, "spring_week"],
    ["First Year Insight Day", undefined, "spring_week"],
    ["Discovery Insight Week for first-years", undefined, "spring_week"],
    ["IBD Spring Internship (first year)", undefined, "spring_week"],
    // novel spring phrasing (not the literal "spring week")
    ["Early Insight Programme for penultimate and first-year students", undefined, "spring_week"],
    // off-cycle
    ["Off-Cycle Internship — M&A", undefined, "off_cycle"],
    ["Off Cycle Analyst Internship", undefined, "off_cycle"],
    // placement (year in industry)
    ["12-Month Industrial Placement", undefined, "placement"],
    ["Year in Industry Analyst", undefined, "placement"],
    ["Sandwich Placement, Markets", undefined, "placement"],
    ["Undergraduate Placement Year", undefined, "placement"],
    // summer / default sink
    ["Summer Internship Programme", undefined, "summer"],
    ["Summer Analyst, Investment Banking", undefined, "summer"],
    ["Penultimate Year Internship", undefined, "summer"],
    ["Investment Banking Internship", undefined, "summer"],
    // genuinely ambiguous → summer default
    ["Analyst", undefined, "summer"],
    ["Graduate opportunity in finance", undefined, "summer"],
    ["", undefined, "summer"],
    // question text contributes signal when role text is silent
    ["Analyst Programme", "Why do you want to join our spring week?", "spring_week"],
    ["Analyst Programme", "Why do you want this off-cycle placement now?", "off_cycle"],
  ];
  it.each(cases)("role=%j question=%j → programme=%s", (role, question, expected) => {
    expect(inferRegister(role, question).programme).toBe(expected);
  });

  it("precedence: spring_week beats off_cycle when both present", () => {
    expect(inferRegister("Off-cycle Spring Insight Week").programme).toBe("spring_week");
  });
  it("precedence: off_cycle beats placement-default ordering keeps off_cycle", () => {
    // contains both off-cycle and a summer word — off_cycle should win
    expect(inferRegister("Off-cycle Summer cover role").programme).toBe("off_cycle");
  });
  it("precedence: placement beats summer default", () => {
    expect(inferRegister("Summer Placement Year").programme).toBe("placement");
  });
});

describe("inferRegister — division", () => {
  const cases: [string, string][] = [
    ["M&A Analyst", "ibd"],
    ["Advisory and Coverage Internship", "ibd"],
    ["Investment Banking Division Spring Week", "ibd"],
    ["IBD Summer Analyst", "ibd"],
    ["Sales & Trading Internship", "markets"],
    ["S&T Summer Analyst", "markets"],
    ["FICC Trading", "markets"],
    ["Equities Trading desk", "markets"],
    ["Global Markets Internship", "markets"],
    ["Asset Management Graduate", "am_wm"],
    ["Wealth Management Internship", "am_wm"],
    ["Portfolio Management, Fixed Income", "am_wm"],
    ["Fund Management Placement", "am_wm"],
    ["Equity Research Summer Analyst", "research"],
    ["Research Analyst, Healthcare sector", "research"],
    // no division signal
    ["Operations Internship", "unknown"],
    ["Technology Spring Week", "unknown"],
    ["Summer Analyst", "unknown"],
    ["", "unknown"],
  ];
  it.each(cases)("role=%j → division=%s", (role, expected) => {
    expect(inferRegister(role).division).toBe(expected);
  });

  it("reads division from question text when role is silent", () => {
    expect(inferRegister("Analyst", "Tell us why our M&A advisory team appeals.").division).toBe(
      "ibd",
    );
  });
});

describe("inferRegister — shape", () => {
  it("returns both keys and is pure (no throw on undefined question)", () => {
    const r = inferRegister("Summer Analyst");
    expect(r).toHaveProperty("programme");
    expect(r).toHaveProperty("division");
  });
});
