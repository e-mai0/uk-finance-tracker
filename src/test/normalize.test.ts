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

describe("normalizeOpportunity season (UK-only)", () => {
  // ADR-005: the tracker is UK-only, so every normalized row is UK
  // (country=UK, isUkBased=true) and there is no region field. Programme season
  // is still classified data and drives the legacy programmeType label +
  // isSummerInternship flag.
  it("defaults to SUMMER_INTERNSHIP when raw omits the field (seed data)", () => {
    const n = normalizeOpportunity(base, now);
    expect(n.programmeTypeEnum).toBe("SUMMER_INTERNSHIP");
    // legacy fields derive from the defaults; board is UK-only
    expect(n.programmeType).toBe("Summer Internship");
    expect(n.country).toBe("UK");
    expect(n.isUkBased).toBe(true);
    expect(n.isSummerInternship).toBe(true);
  });

  it("carries a classified Spring Week through and derives legacy flags", () => {
    const n = normalizeOpportunity(
      { ...base, programmeType: "SPRING_WEEK" },
      now,
    );
    expect(n.programmeTypeEnum).toBe("SPRING_WEEK");
    expect(n.programmeType).toBe("Spring Week"); // legacy string label
    expect(n.isSummerInternship).toBe(false);
    expect(n.isUkBased).toBe(true);
    expect(n.country).toBe("UK");
  });

  it("derives the off-cycle legacy label and a false summer flag, still UK", () => {
    const n = normalizeOpportunity(
      { ...base, programmeType: "OFF_CYCLE" },
      now,
    );
    expect(n.programmeType).toBe("Off-Cycle");
    expect(n.isSummerInternship).toBe(false);
    expect(n.isUkBased).toBe(true);
    expect(n.country).toBe("UK");
  });

  it("derives the industrial-placement legacy label, still UK", () => {
    const n = normalizeOpportunity(
      { ...base, programmeType: "INDUSTRIAL_PLACEMENT" },
      now,
    );
    expect(n.programmeTypeEnum).toBe("INDUSTRIAL_PLACEMENT");
    expect(n.programmeType).toBe("Industrial Placement");
    expect(n.isSummerInternship).toBe(false);
    expect(n.isUkBased).toBe(true);
    expect(n.country).toBe("UK");
  });
});
