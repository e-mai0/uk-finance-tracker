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

describe("normalizeOpportunity season-aware deadline inference", () => {
  it("preserves a real deadline for every season (never overridden)", () => {
    for (const season of ["SPRING_WEEK", "SUMMER_INTERNSHIP", "OFF_CYCLE"] as const) {
      const n = normalizeOpportunity(
        { ...base, programmeType: season, deadlineAt: "2026-09-30" },
        now,
      );
      expect(n.deadlineEstimated).toBe(false);
      expect(n.isRolling).toBe(false);
      expect(n.deadlineAt?.getUTCMonth()).toBe(8); // September — the stated date
    }
  });

  it("SUMMER_INTERNSHIP infers the end-of-November cycle close (unchanged)", () => {
    const n = normalizeOpportunity({ ...base, programmeType: "SUMMER_INTERNSHIP" }, now);
    expect(n.deadlineEstimated).toBe(true);
    expect(n.isRolling).toBe(true);
    expect(n.deadlineAt?.getUTCMonth()).toBe(10); // November
  });

  it("SPRING_WEEK infers an earlier (October) close than summer", () => {
    const spring = normalizeOpportunity({ ...base, programmeType: "SPRING_WEEK" }, now);
    const summer = normalizeOpportunity({ ...base, programmeType: "SUMMER_INTERNSHIP" }, now);
    expect(spring.deadlineEstimated).toBe(true);
    expect(spring.isRolling).toBe(true);
    expect(spring.deadlineAt?.getUTCMonth()).toBe(9); // October
    expect(spring.deadlineAt!.getTime()).toBeLessThan(summer.deadlineAt!.getTime());
  });

  it("OFF_CYCLE fabricates no deadline — null date, rolling, not estimated", () => {
    const n = normalizeOpportunity({ ...base, programmeType: "OFF_CYCLE" }, now);
    expect(n.deadlineAt).toBeNull();
    expect(n.deadlineEstimated).toBe(false); // nothing was estimated
    expect(n.isRolling).toBe(true); // honestly rolling
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

  // ADR-006: INDUSTRIAL_PLACEMENT was removed from the ProgrammeType enum
  // (industrial placements are now excluded upstream, never normalized). The
  // three retained buckets (SPRING_WEEK / SUMMER_INTERNSHIP / OFF_CYCLE) carry
  // through with their correct legacy labels — asserted above and here for the
  // SUMMER default, which keeps isSummerInternship=true.
  it("derives the summer legacy label and a true summer flag, UK", () => {
    const n = normalizeOpportunity(
      { ...base, programmeType: "SUMMER_INTERNSHIP" },
      now,
    );
    expect(n.programmeTypeEnum).toBe("SUMMER_INTERNSHIP");
    expect(n.programmeType).toBe("Summer Internship");
    expect(n.isSummerInternship).toBe(true);
    expect(n.isUkBased).toBe(true);
    expect(n.country).toBe("UK");
  });
});
