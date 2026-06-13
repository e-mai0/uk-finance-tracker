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
