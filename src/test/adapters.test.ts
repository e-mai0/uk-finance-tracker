import { describe, expect, it } from "vitest";
import { mapGreenhouseJobs } from "../ingestion/adapters/greenhouse";
import { mapLeverPostings } from "../ingestion/adapters/lever";
import { mapAshbyJobs } from "../ingestion/adapters/ashby";
import { mapSmartRecruiterPostings } from "../ingestion/adapters/smartrecruiters";
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
        location: { name: "New York" }, // non-UK → EXCLUDED (not-uk), ADR-005 UK-only
        departments: [],
      },
    ],
  };

  it("maps included jobs and applies the classifier", () => {
    const out = mapGreenhouseJobs(payload, fund);
    // Only job #1 (the UK summer intern) survives. Job #2 (full-time) is
    // not-internship; job #3 (New York) is not-uk — the board is UK-only
    // (ADR-005), so the non-UK role is excluded again.
    expect(out).toHaveLength(1);

    const uk = out.find((o) => o.applicationUrl?.endsWith("/jobs/1"));
    expect(uk).toBeDefined();
    expect(uk!.employer).toBe("Acme Capital");
    expect(uk!.roleFamily).toBe("QUANT");
    expect(uk!.programmeType).toBe("SUMMER_INTERNSHIP");
    expect(uk!.location).toBe("London, United Kingdom");
    expect(uk!.status).toBe("OPEN");
    expect(uk!.sourceType).toBe("GREENHOUSE");
    expect(uk!.tags).toContain("research");

    // The New York role (#3) is excluded again (UK-only gate restored).
    expect(out.find((o) => o.applicationUrl?.endsWith("/jobs/3"))).toBeUndefined();
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

describe("mapSmartRecruiterPostings", () => {
  const bank: AdapterEmployer = { name: "Big Bank", sector: "Investment Bank" };
  // Shape mirrors api.smartrecruiters.com/v1/companies/{co}/postings (verified
  // live against the Visa board: { totalFound, content[] } with nested
  // location/department/function/typeOfEmployment objects).
  const payload = {
    offset: 0,
    limit: 100,
    totalFound: 3,
    content: [
      {
        id: "744000111111111",
        name: "Summer Internship - Markets, 2027",
        releasedDate: "2026-06-01T09:00:00Z",
        location: { city: "London", region: "England", country: "gb", fullLocation: "London, England, United Kingdom" },
        department: { id: "1", label: "Global Markets" },
        function: { id: "f", label: "Trading" },
        typeOfEmployment: { id: "intern", label: "Intern" },
        company: { identifier: "BigBank", name: "Big Bank" },
      },
      {
        id: "744000222222222",
        name: "Summer Analyst Internship",
        releasedDate: "2026-06-02T09:00:00Z",
        location: { city: "New York", region: "NY", country: "us", fullLocation: "New York, NY, United States" },
        department: { label: "Investment Banking" },
        company: { identifier: "BigBank" },
      },
      {
        id: "744000333333333",
        name: "Vice President, Equity Research", // full-time → not-internship
        releasedDate: "2026-06-03T09:00:00Z",
        location: { city: "London", country: "gb", fullLocation: "London, United Kingdom" },
        department: { label: "Research" },
        typeOfEmployment: { label: "Full-time" },
        company: { identifier: "BigBank" },
      },
    ],
  };

  it("maps only the UK internship and applies the classifier", () => {
    const out = mapSmartRecruiterPostings(payload, "BigBank", bank);
    expect(out).toHaveLength(1);
    const o = out[0];
    expect(o.employer).toBe("Big Bank");
    expect(o.title).toBe("Summer Internship - Markets, 2027");
    expect(o.roleFamily).toBe("MARKETS");
    expect(o.programmeType).toBe("SUMMER_INTERNSHIP");
    expect(o.location).toBe("London, England, United Kingdom");
    expect(o.status).toBe("OPEN");
    expect(o.sourceType).toBe("SMARTRECRUITERS");
    expect(o.firstSeen).toBe("2026-06-01T09:00:00Z");
  });

  it("builds the public apply URL from the company identifier and posting id", () => {
    const [o] = mapSmartRecruiterPostings(payload, "BigBank", bank);
    expect(o.applicationUrl).toBe("https://jobs.smartrecruiters.com/BigBank/744000111111111");
    expect(o.sourceUrl).toBe(o.applicationUrl);
  });

  it("excludes the non-UK internship (ADR-005 UK-only)", () => {
    const out = mapSmartRecruiterPostings(payload, "BigBank", bank);
    expect(out.find((o) => o.title === "Summer Analyst Internship")).toBeUndefined();
  });

  it("never republishes employer copy — summary is templated", () => {
    const [o] = mapSmartRecruiterPostings(payload, "BigBank", bank);
    expect(o.summary).toContain("SmartRecruiters");
    expect(o.summary).toContain("Big Bank");
  });

  it("throws on an unexpected payload shape", () => {
    expect(() => mapSmartRecruiterPostings({ nope: true }, "BigBank", bank)).toThrow(
      /content/,
    );
  });
});
