import { describe, it, expect } from "vitest";
import {
  PROGRAMME_TYPES,
  REGIONS,
  PROGRAMME_TYPE_LABELS,
  REGION_LABELS,
  type ProgrammeType,
  type Region,
} from "../lib/constants";

// The full set of taxonomy members, written out independently of the source so
// the test pins the contract rather than echoing whatever the source happens to
// export (guards future drift / accidental additions or removals).
const ALL_PROGRAMME_TYPES: ProgrammeType[] = [
  "SPRING_WEEK",
  "SUMMER_INTERNSHIP",
  "OFF_CYCLE",
  "INDUSTRIAL_PLACEMENT",
];

const ALL_REGIONS: Region[] = ["UK", "US", "HK", "OTHER"];

describe("PROGRAMME_TYPES option list", () => {
  it("lists every ProgrammeType member exactly once", () => {
    const values = PROGRAMME_TYPES.map((p) => p.value);
    expect(values.length).toBe(ALL_PROGRAMME_TYPES.length);
    for (const member of ALL_PROGRAMME_TYPES) {
      expect(values.filter((v) => v === member).length).toBe(1);
    }
  });

  it("is ordered: Spring Week, Summer Internship, Off-Cycle, Industrial Placement", () => {
    expect(PROGRAMME_TYPES.map((p) => p.value)).toEqual([
      "SPRING_WEEK",
      "SUMMER_INTERNSHIP",
      "OFF_CYCLE",
      "INDUSTRIAL_PLACEMENT",
    ]);
  });

  it("carries the exact labels", () => {
    expect(PROGRAMME_TYPES).toEqual([
      { value: "SPRING_WEEK", label: "Spring Week" },
      { value: "SUMMER_INTERNSHIP", label: "Summer Internship" },
      { value: "OFF_CYCLE", label: "Off-Cycle" },
      { value: "INDUSTRIAL_PLACEMENT", label: "Industrial Placement" },
    ]);
  });
});

describe("REGIONS option list", () => {
  it("lists every Region member exactly once", () => {
    const values = REGIONS.map((r) => r.value);
    expect(values.length).toBe(ALL_REGIONS.length);
    for (const member of ALL_REGIONS) {
      expect(values.filter((v) => v === member).length).toBe(1);
    }
  });

  it("is ordered: UK, US, HK, Other", () => {
    expect(REGIONS.map((r) => r.value)).toEqual(["UK", "US", "HK", "OTHER"]);
  });

  it("carries the exact labels", () => {
    expect(REGIONS).toEqual([
      { value: "UK", label: "UK" },
      { value: "US", label: "US" },
      { value: "HK", label: "Hong Kong" },
      { value: "OTHER", label: "Other" },
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
      INDUSTRIAL_PLACEMENT: "Industrial Placement",
    });
  });

  it("agrees with the PROGRAMME_TYPES option-list labels", () => {
    for (const { value, label } of PROGRAMME_TYPES) {
      expect(PROGRAMME_TYPE_LABELS[value]).toBe(label);
    }
  });
});

describe("REGION_LABELS map", () => {
  it("is total — one label per Region member, nothing extra", () => {
    expect(Object.keys(REGION_LABELS).sort()).toEqual([...ALL_REGIONS].sort());
  });

  it("matches the exact label strings", () => {
    expect(REGION_LABELS).toEqual({
      UK: "UK",
      US: "US",
      HK: "Hong Kong",
      OTHER: "Other",
    });
  });

  it("agrees with the REGIONS option-list labels", () => {
    for (const { value, label } of REGIONS) {
      expect(REGION_LABELS[value]).toBe(label);
    }
  });
});
