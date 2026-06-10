import { describe, expect, it } from "vitest";
import { deriveStorySignal, buildOutcomeObservation } from "@/server/engine/outcomes";

describe("deriveStorySignal", () => {
  it("any positive outcome -> strength high", () => {
    expect(deriveStorySignal([{ status: "INTERVIEWING" }, { status: "REJECTED" }])).toEqual({
      strength: "high",
      failure: null,
    });
  });
  it("2+ rejections, no positives -> failure note, strength untouched", () => {
    const r = deriveStorySignal([{ status: "REJECTED" }, { status: "REJECTED" }]);
    expect(r.strength).toBeNull();
    expect(r.failure).toContain("2 rejected");
  });
  it("small sample -> no change", () => {
    expect(deriveStorySignal([{ status: "REJECTED" }])).toEqual({ strength: null, failure: null });
  });
});

describe("buildOutcomeObservation", () => {
  it("needs at least 4 settled applications", () => {
    expect(buildOutcomeObservation([{ status: "REJECTED" }, { status: "OFFER" }], "2026-06-10")).toBeNull();
  });
  it("summarises progression with low confidence", () => {
    const apps = [
      { status: "INTERVIEWING" },
      { status: "REJECTED" },
      { status: "REJECTED" },
      { status: "OFFER" },
      { status: "SUBMITTED" }, // unsettled, excluded from the rate
    ];
    const line = buildOutcomeObservation(apps, "2026-06-10");
    expect(line).toContain("2 of 4");
    expect(line).toContain("(confidence: low, confirmed: 2026-06-10)");
  });
});
