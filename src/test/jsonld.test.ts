import { describe, expect, it } from "vitest";
import {
  extractJobPostings,
  jobLocationToString,
  mapJobPostings,
} from "../ingestion/jsonld";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const employer: AdapterEmployer = { name: "Acme Partners", sector: "Advisory" };

const POSTING = {
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  title: "M&A Summer Analyst 2027",
  url: "https://careers.acme.com/job/123",
  datePosted: "2026-06-01",
  validThrough: "2026-11-01",
  employmentType: "INTERN",
  description: "<p>Join our M&A team.</p>",
  jobLocation: {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      addressLocality: "London",
      addressCountry: "GB",
    },
  },
};

function page(...blocks: unknown[]): string {
  return `<html><head>${blocks
    .map(
      (b) =>
        `<script type="application/ld+json">${JSON.stringify(b)}</script>`,
    )
    .join("")}</head><body>hi</body></html>`;
}

describe("extractJobPostings", () => {
  it("reads a plain JobPosting block", () => {
    expect(extractJobPostings(page(POSTING))).toHaveLength(1);
  });

  it("reads arrays and @graph wrappers, skipping other types", () => {
    const html = page(
      [POSTING, { "@type": "Organization", name: "Acme" }],
      { "@graph": [POSTING] },
    );
    expect(extractJobPostings(html)).toHaveLength(2);
  });

  it("survives malformed JSON-LD blocks", () => {
    const html =
      `<script type="application/ld+json">{broken</script>` + page(POSTING);
    expect(extractJobPostings(html)).toHaveLength(1);
  });
});

describe("jobLocationToString", () => {
  it("flattens Place objects and arrays", () => {
    expect(jobLocationToString(POSTING.jobLocation)).toBe("London, GB");
    expect(
      jobLocationToString([POSTING.jobLocation, "Remote"]),
    ).toBe("London, GB; Remote");
  });
});

describe("mapJobPostings", () => {
  it("maps an included posting with real deadline and posted date", () => {
    const out = mapJobPostings([POSTING], employer, "https://careers.acme.com");
    expect(out).toHaveLength(1);
    expect(out[0].roleFamily).toBe("IB");
    expect(out[0].deadlineAt).toBe("2026-11-01");
    expect(out[0].firstSeen).toBe("2026-06-01");
    expect(out[0].applicationUrl).toBe("https://careers.acme.com/job/123");
    expect(out[0].sourceType).toBe("CAREERS_PAGE");
    // GB country code counts as UK
    expect(out[0].location).toBe("London, GB");
  });

  it("filters non-UK and non-intern postings", () => {
    const ny = {
      ...POSTING,
      jobLocation: {
        address: { addressLocality: "New York", addressCountry: "US" },
      },
    };
    const fullTime = {
      ...POSTING,
      title: "M&A Associate",
      employmentType: "FULL_TIME",
    };
    expect(mapJobPostings([ny, fullTime], employer, "https://x.com")).toHaveLength(
      0,
    );
  });

  it("never republishes the employer-written description", () => {
    const [opp] = mapJobPostings([POSTING], employer, "https://x.com");
    expect(opp.summary).not.toContain("Join our M&A team");
  });
});
