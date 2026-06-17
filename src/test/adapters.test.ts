import { describe, expect, it } from "vitest";
import { mapGreenhouseJobs } from "../ingestion/adapters/greenhouse";
import { mapLeverPostings } from "../ingestion/adapters/lever";
import { mapAshbyJobs } from "../ingestion/adapters/ashby";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const fund: AdapterEmployer = { name: "Acme Capital", sector: "Hedge Fund" };

describe("mapGreenhouseJobs", () => {
  const payload = {
    jobs: [
      {
        id: 1,
        title: "Quantitative Research Intern, Summer 2027",
        absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1",
        updated_at: "2026-06-01T00:00:00Z",
        location: { name: "London, United Kingdom" },
        departments: [{ name: "Research" }],
        content: "Work with the quant research team.",
      },
      {
        id: 2,
        title: "Quantitative Researcher", // full-time → excluded
        absolute_url: "https://job-boards.greenhouse.io/acme/jobs/2",
        location: { name: "London" },
        departments: [],
      },
      {
        id: 3,
        title: "Summer Analyst, Investment Team",
        absolute_url: "https://job-boards.greenhouse.io/acme/jobs/3",
        location: { name: "New York" }, // non-UK → INCLUDED + tagged region US (ADR-003)
        departments: [],
      },
    ],
  };

  it("maps included jobs and applies the classifier", () => {
    const out = mapGreenhouseJobs(payload, fund);
    // job #1 (UK summer intern) + job #3 (NY summer analyst, now classified
    // rather than discarded per ADR-003). Job #2 (full-time) stays excluded.
    expect(out).toHaveLength(2);

    const uk = out.find((o) => o.applicationUrl?.endsWith("/jobs/1"));
    expect(uk).toBeDefined();
    expect(uk!.employer).toBe("Acme Capital");
    expect(uk!.roleFamily).toBe("QUANT");
    expect(uk!.location).toBe("London, United Kingdom");
    expect(uk!.region).toBe("UK");
    expect(uk!.status).toBe("OPEN");
    expect(uk!.sourceType).toBe("GREENHOUSE");
    expect(uk!.tags).toContain("research");

    // The previously-dropped New York role is now present AND tagged region US.
    const ny = out.find((o) => o.applicationUrl?.endsWith("/jobs/3"));
    expect(ny).toBeDefined();
    expect(ny!.title).toBe("Summer Analyst, Investment Team");
    expect(ny!.region).toBe("US");

    // The full-time role (#2) is still excluded (not-internship is untouched).
    expect(out.find((o) => o.applicationUrl?.endsWith("/jobs/2"))).toBeUndefined();
  });

  it("never republishes the employer-written description", () => {
    const [opp] = mapGreenhouseJobs(payload, fund);
    expect(opp.summary).not.toContain("Work with the quant research team");
  });

  it("throws on an unexpected payload shape", () => {
    expect(() => mapGreenhouseJobs({ nope: true }, fund)).toThrow(
      /missing `jobs`/,
    );
  });
});

describe("mapLeverPostings", () => {
  const payload = [
    {
      id: "a",
      text: "Trading Intern (Summer 2027)",
      hostedUrl: "https://jobs.lever.co/acme/a",
      createdAt: 1750000000000,
      categories: {
        commitment: "Intern",
        department: "Trading",
        location: "London",
      },
      descriptionPlain: "Join the desk.",
    },
    {
      id: "b",
      text: "Senior Trader", // not an internship → excluded
      hostedUrl: "https://jobs.lever.co/acme/b",
      categories: { commitment: "Full-time", location: "London" },
    },
  ];

  it("maps included postings", () => {
    const out = mapLeverPostings(payload, fund);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Trading Intern (Summer 2027)");
    expect(out[0].roleFamily).toBe("MARKETS");
    expect(out[0].sourceType).toBe("LEVER");
    expect(out[0].firstSeen).toBe(new Date(1750000000000).toISOString());
  });

  it("throws when the payload is not an array", () => {
    expect(() => mapLeverPostings({ jobs: [] }, fund)).toThrow(/array/);
  });
});

describe("mapAshbyJobs", () => {
  const payload = {
    jobs: [
      {
        id: "x",
        title: "Investment Intern, Summer 2027",
        location: "London",
        department: "Investment Team",
        employmentType: "Intern",
        isListed: true,
        jobUrl: "https://jobs.ashbyhq.com/acme/x",
        publishedAt: "2026-06-02T00:00:00Z",
      },
      {
        id: "y",
        title: "Summer Intern", // generic title; remote w/ London secondary
        location: "Remote",
        secondaryLocations: [{ location: "London" }],
        employmentType: "Intern",
        isListed: true,
        jobUrl: "https://jobs.ashbyhq.com/acme/y",
      },
      {
        id: "z",
        title: "Unlisted Intern",
        location: "London",
        employmentType: "Intern",
        isListed: false, // → excluded
        jobUrl: "https://jobs.ashbyhq.com/acme/z",
      },
    ],
  };

  it("maps listed jobs, using secondary locations and the sector fallback", () => {
    const out = mapAshbyJobs(payload, fund);
    expect(out).toHaveLength(2);
    expect(out[0].roleFamily).toBe("HEDGE_FUND"); // "investment team" keyword
    expect(out[1].roleFamily).toBe("HEDGE_FUND"); // sector fallback
    expect(out[1].location).toBe("Remote");
    expect(out.every((o) => o.sourceType === "ASHBY")).toBe(true);
  });

  it("drops unlisted jobs", () => {
    const out = mapAshbyJobs(payload, fund);
    expect(out.find((o) => o.title === "Unlisted Intern")).toBeUndefined();
  });
});
