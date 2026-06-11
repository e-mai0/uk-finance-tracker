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
  it("keeps only London summer internships", () => {
    const out = mapJaneStreetJobs(FEED, js);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Quantitative Trader — Summer Internship");
    expect(out[0].location).toBe("London");
    expect(out[0].roleFamily).toBe("QUANT");
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
