import { describe, expect, it } from "vitest";
import { normalizeOpportunity } from "../ingestion/normalize";
import type { RawOpportunity } from "../ingestion/types";

const base: RawOpportunity = {
  employer: "Acme", title: "Summer Analyst", roleFamily: "IB",
  location: "London", status: "OPEN", summary: "x",
};
const now = new Date("2026-07-15T00:00:00Z");

describe("normalizeOpportunity deadline handling", () => {
  it("keeps a real deadline and does not flag it estimated", () => {
    const n = normalizeOpportunity({ ...base, deadlineAt: "2026-10-31" }, now);
    expect(n.deadlineEstimated).toBe(false);
    expect(n.isRolling).toBe(false);
    expect(n.deadlineAt?.getUTCMonth()).toBe(9); // October
  });

  it("infers a deadline when none is published and flags it", () => {
    const n = normalizeOpportunity(base, now);
    expect(n.deadlineEstimated).toBe(true);
    expect(n.isRolling).toBe(true);
    expect(n.deadlineAt).not.toBeNull();
  });
});

describe("normalizeOpportunity season + region", () => {
  it("defaults to SUMMER_INTERNSHIP / UK when raw omits the fields (seed data)", () => {
    const n = normalizeOpportunity(base, now);
    expect(n.programmeTypeEnum).toBe("SUMMER_INTERNSHIP");
    expect(n.region).toBe("UK");
    // legacy fields derive from the defaults
    expect(n.programmeType).toBe("Summer Internship");
    expect(n.country).toBe("UK");
    expect(n.isUkBased).toBe(true);
    expect(n.isSummerInternship).toBe(true);
  });

  it("carries a classified Spring Week through and derives legacy flags", () => {
    const n = normalizeOpportunity(
      { ...base, programmeType: "SPRING_WEEK", region: "UK" },
      now,
    );
    expect(n.programmeTypeEnum).toBe("SPRING_WEEK");
    expect(n.region).toBe("UK");
    expect(n.programmeType).toBe("Spring Week"); // legacy string label
    expect(n.isSummerInternship).toBe(false);
    expect(n.isUkBased).toBe(true);
    expect(n.country).toBe("UK");
  });

  it("carries a US summer internship through and derives non-UK legacy flags", () => {
    const n = normalizeOpportunity(
      { ...base, programmeType: "SUMMER_INTERNSHIP", region: "US" },
      now,
    );
    expect(n.programmeTypeEnum).toBe("SUMMER_INTERNSHIP");
    expect(n.region).toBe("US");
    expect(n.isUkBased).toBe(false);
    expect(n.country).toBe("US");
    expect(n.isSummerInternship).toBe(true);
  });

  it("derives both legacy flags false for an off-cycle HK role", () => {
    const n = normalizeOpportunity(
      { ...base, programmeType: "OFF_CYCLE", region: "HK" },
      now,
    );
    expect(n.programmeType).toBe("Off-Cycle");
    expect(n.isSummerInternship).toBe(false);
    expect(n.isUkBased).toBe(false);
    expect(n.country).toBe("HK");
  });
});
