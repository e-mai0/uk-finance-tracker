import { describe, expect, it } from "vitest";
import { mapWorkdayJobs } from "../ingestion/adapters/workday";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const ms: AdapterEmployer = { name: "Morgan Stanley", sector: "Investment Bank" };

const PAGE = { total: 2, jobPostings: [
  { title: "2026 Summer Analyst Program", externalPath: "/job/London/Summer-Analyst_JR036591", locationsText: "London, United Kingdom", bulletFields: ["JR036591"] },
  { title: "2026 Summer Analyst Program", externalPath: "/job/NY/Summer-Analyst_JR036592", locationsText: "New York, United States", bulletFields: ["JR036592"] },
]};

describe("mapWorkdayJobs", () => {
  it("keeps UK rows, keys on the reqId, sets WORKDAY sourceType", () => {
    const out = mapWorkdayJobs(PAGE, "https://ms.wd5.myworkdayjobs.com", "External", ms);
    expect(out).toHaveLength(1);
    expect(out[0].sourceType).toBe("WORKDAY");
    expect(out[0].applicationUrl).toContain("JR036591");
  });
  it("throws on a bad payload", () => {
    expect(() => mapWorkdayJobs({}, "https://x", "y", ms)).toThrow(/jobPostings/);
  });
});
