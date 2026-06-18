import { describe, it, expect } from "vitest";
import {
  PROGRAMME_TYPES,
  PROGRAMME_TYPE_LABELS,
  type ProgrammeType,
} from "../lib/constants";

// The full set of taxonomy members, written out independently of the source so
// the test pins the contract rather than echoing whatever the source happens to
// export (guards future drift / accidental additions or removals).
// Region was removed (ADR-005, UK-only); industrial placement was removed
// (ADR-006, excluded "for now") — only the 3 core internship seasons remain.
const ALL_PROGRAMME_TYPES: ProgrammeType[] = [
  "SPRING_WEEK",
  "SUMMER_INTERNSHIP",
  "OFF_CYCLE",
];

describe("PROGRAMME_TYPES option list", () => {
  it("lists every ProgrammeType member exactly once", () => {
    const values = PROGRAMME_TYPES.map((p) => p.value);
    expect(values.length).toBe(ALL_PROGRAMME_TYPES.length);
    for (const member of ALL_PROGRAMME_TYPES) {
      expect(values.filter((v) => v === member).length).toBe(1);
    }
  });

  it("is ordered: Spring Week, Summer Internship, Off-Cycle", () => {
    expect(PROGRAMME_TYPES.map((p) => p.value)).toEqual([
      "SPRING_WEEK",
      "SUMMER_INTERNSHIP",
      "OFF_CYCLE",
    ]);
  });

  it("carries the exact labels", () => {
    expect(PROGRAMME_TYPES).toEqual([
      { value: "SPRING_WEEK", label: "Spring Week" },
      { value: "SUMMER_INTERNSHIP", label: "Summer Internship" },
      { value: "OFF_CYCLE", label: "Off-Cycle" },
    ]);
  });
});

describe("PROGRAMME_TYPE_LABELS map", () => {
  it("is total — one label per ProgrammeType member, nothing extra", () => {
    expect(Object.keys(PROGRAMME_TYPE_LABELS).sort()).toEqual(
      [...ALL_PROGRAMME_TYPES].sort(),
    );
  });

  it("matches the exact label strings", () => {
    expect(PROGRAMME_TYPE_LABELS).toEqual({
      SPRING_WEEK: "Spring Week",
      SUMMER_INTERNSHIP: "Summer Internship",
      OFF_CYCLE: "Off-Cycle",
    });
  });

  it("agrees with the PROGRAMME_TYPES option-list labels", () => {
    for (const { value, label } of PROGRAMME_TYPES) {
      expect(PROGRAMME_TYPE_LABELS[value]).toBe(label);
    }
  });
});
