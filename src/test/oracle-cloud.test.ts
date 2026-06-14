import { describe, expect, it } from "vitest";
import { mapOracleList } from "../ingestion/adapters/oracle-cloud";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const jpm: AdapterEmployer = { name: "J.P. Morgan", sector: "Investment Bank" };

const LIST = { items: [{ TotalJobsCount: 2, requisitionList: [
  { Id: "210693588", Title: "2026 Summer Analyst Programme", PrimaryLocation: "London, England, United Kingdom", PrimaryLocationCountry: "GB" },
  { Id: "210000001", Title: "2026 Summer Analyst Programme", PrimaryLocation: "New York, United States", PrimaryLocationCountry: "US" },
]}]};

describe("mapOracleList", () => {
  it("keeps only GB rows and carries the requisition Id + sourceType", () => {
    const out = mapOracleList(LIST, jpm);
    expect(out).toHaveLength(1);
    expect(out[0].sourceType).toBe("ORACLE_CLOUD");
    expect(out[0].applicationUrl).toContain("210693588");
    expect(out[0].location).toContain("London");
  });
  it("throws on an unexpected shape", () => {
    expect(() => mapOracleList({ nope: true }, jpm)).toThrow(/requisitionList/);
  });
});
