import { describe, expect, it } from "vitest";
import { mapJaneStreetJobs } from "../ingestion/adapters/janestreet";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const js: AdapterEmployer = { name: "Jane Street", sector: "Proprietary Trading" };

const FEED = [
  {
    id: 1001,
    position: "Quantitative Trader",
    category: "Trading, Research, and Machine Learning",
    availability: "Summer Internship",
    city: "LDN",
    overview: "Trade with us.",
  },
  {
    id: 1002,
    position: "Software Engineer",
    category: "Technology",
    availability: "Summer Internship (December-February)", // HK cycle
    city: "HKG",
  },
  {
    id: 1003,
    position: "Machine Learning Researcher",
    category: "Trading, Research, and Machine Learning",
    availability: "Winter Internship", // not the UK summer cycle
    city: "LDN",
  },
  {
    id: 1004,
    position: "AML Onboarding Analyst",
    category: "Legal and Compliance",
    availability: "Full-Time: Experienced",
    city: "LDN",
  },
  {
    id: 1005,
    position: "Software Engineer",
    category: "Technology",
    availability: "Summer Internship",
    city: "NYC", // not UK
  },
];

describe("mapJaneStreetJobs", () => {
  it("keeps only the London summer internship (UK-only) and tags its season", () => {
    const out = mapJaneStreetJobs(FEED, js);
    // ADR-005 (UK-only): just the London summer intern (1001) survives. The
    // winter/December cycles (1002, 1003) are dropped by the adapter's season
    // filter; the full-time AML analyst (1004) is not-internship; and the NYC
    // summer intern (1005) is now excluded as not-uk (the gate is restored).
    expect(out).toHaveLength(1);

    const ldn = out.find((o) => o.location === "London");
    expect(ldn).toBeDefined();
    expect(ldn!.title).toBe("Quantitative Trader — Summer Internship");
    expect(ldn!.roleFamily).toBe("QUANT");
    expect(ldn!.programmeType).toBe("SUMMER_INTERNSHIP");

    // The New York summer internship is excluded again (UK-only gate).
    expect(out.find((o) => o.location === "New York")).toBeUndefined();
  });

  it("builds the verified position URL pattern", () => {
    const [opp] = mapJaneStreetJobs(FEED, js);
    expect(opp.applicationUrl).toBe(
      "https://www.janestreet.com/join-jane-street/position/1001/",
    );
  });

  it("drops winter and southern-hemisphere summer cycles", () => {
    const out = mapJaneStreetJobs(FEED, js);
    expect(out.find((o) => o.title.includes("Machine Learning"))).toBeUndefined();
    expect(out.find((o) => o.location === "Hong Kong")).toBeUndefined();
  });

  it("throws when the payload is not an array", () => {
    expect(() => mapJaneStreetJobs({ jobs: [] }, js)).toThrow(/array/);
  });
});
