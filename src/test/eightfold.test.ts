import { describe, expect, it } from "vitest";
import { mapEightfold } from "../ingestion/adapters/eightfold";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const hsbc: AdapterEmployer = { name: "HSBC", sector: "Investment Bank" };

const APPLY = { count: 2, positions: [
  { id: 563774611317888, name: "2026 Global Banking Summer Internship", location: "London, United Kingdom", canonicalPositionUrl: "https://hsbc.eightfold.ai/careers/job/1" },
  { id: 563774611317889, name: "2026 Markets Summer Internship", location: "Hong Kong", canonicalPositionUrl: "https://hsbc.eightfold.ai/careers/job/2" },
]};

describe("mapEightfold (apply variant)", () => {
  it("keeps London internships and keys on numeric id", () => {
    const out = mapEightfold(APPLY, "apply", "https://hsbc.eightfold.ai", hsbc);
    expect(out).toHaveLength(1);
    expect(out[0].sourceType).toBe("EIGHTFOLD");
    expect(out[0].applicationUrl).toContain("/job/1");
  });
});
