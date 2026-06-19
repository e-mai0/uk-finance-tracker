import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mapDeShawInternships,
  parseDeShawNextData,
} from "../ingestion/adapters/deshaw";
import type { AdapterEmployer } from "../ingestion/adapters/common";

/**
 * D. E. Shaw's careers site is a Next.js app whose `/careers` page server-renders
 * the full opening list into a `__NEXT_DATA__` JSON blob (pageProps.internships /
 * pageProps.regularJobs). No browser is needed — a plain server-side fetch returns
 * the data. The fixture is a slimmed copy of the LIVE blob (probed 2026-06-19),
 * keeping only the fields the adapter consumes.
 */

const deshaw: AdapterEmployer = {
  name: "D. E. Shaw",
  sector: "Hedge Fund",
};

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "fixtures/deshaw-next-data.json"), "utf8"),
);
const INTERNSHIPS = FIXTURE.props.pageProps.internships;

describe("parseDeShawNextData", () => {
  it("extracts the internships array from a __NEXT_DATA__ script tag", () => {
    const html =
      `<html><body><script id="__NEXT_DATA__" type="application/json">` +
      `${JSON.stringify(FIXTURE)}</script></body></html>`;
    const parsed = parseDeShawNextData(html);
    expect(parsed.internships).toHaveLength(INTERNSHIPS.length);
    expect(parsed.internships[0].displayName).toContain("Trader/Analyst Intern");
  });

  it("throws when the __NEXT_DATA__ blob is absent", () => {
    expect(() => parseDeShawNextData("<html><body>no data</body></html>")).toThrow(
      /__NEXT_DATA__/,
    );
  });

  it("returns empty arrays when pageProps carries no jobs (off-season)", () => {
    const empty = JSON.stringify({ props: { pageProps: {} } });
    const html = `<script id="__NEXT_DATA__" type="application/json">${empty}</script>`;
    const parsed = parseDeShawNextData(html);
    expect(parsed.internships).toEqual([]);
    expect(parsed.regularJobs).toEqual([]);
  });
});

describe("mapDeShawInternships", () => {
  it("keeps only the LIVE London early-careers internships (UK-only gate)", () => {
    const out = mapDeShawInternships(INTERNSHIPS, deshaw);
    // London Trader/Analyst (5862) + London Investor Relations (5917) survive.
    // New York interns (5890, 5731) are dropped as not-uk; the Industry
    // Placement Year (5922) is dropped as an industrial placement; and the
    // inactive/closed London role (5999) is dropped (not active on the site).
    const titles = out.map((o) => o.title).sort();
    expect(out).toHaveLength(2);
    expect(out.every((o) => o.location === "London")).toBe(true);
    expect(titles).toEqual([
      "Investor Relations Intern (London) - Summer 2027",
      "Trader/Analyst Intern (London) - Summer 2027",
    ]);
  });

  it("builds the canonical detail URL from the jobUrl slug", () => {
    const out = mapDeShawInternships(INTERNSHIPS, deshaw);
    const trader = out.find((o) => o.title.startsWith("Trader/Analyst"));
    expect(trader?.applicationUrl).toBe(
      "https://www.deshaw.com/careers/Trader-Analyst-Intern-London-Summer-2027-5862",
    );
    expect(trader?.sourceUrl).toBe(trader?.applicationUrl);
    expect(trader?.sourceType).toBe("CAREERS_PAGE");
  });

  it("classifies London trader/IR as the right role family + summer season", () => {
    const out = mapDeShawInternships(INTERNSHIPS, deshaw);
    const trader = out.find((o) => o.title.startsWith("Trader/Analyst"));
    expect(trader?.programmeType).toBe("SUMMER_INTERNSHIP");
    expect(trader?.status).toBe("OPEN");
  });

  it("carries the validToDate as the deadline when the site provides one", () => {
    const out = mapDeShawInternships(INTERNSHIPS, deshaw);
    const ir = out.find((o) => o.title.startsWith("Investor Relations"));
    // 5917 has validToDate 2026-11-30; 5862 has null → no deadline.
    expect(ir?.deadlineAt).toBe("2026-11-30");
    const trader = out.find((o) => o.title.startsWith("Trader/Analyst"));
    expect(trader?.deadlineAt ?? null).toBeNull();
  });

  it("does not copy employer description text into the summary", () => {
    const out = mapDeShawInternships(INTERNSHIPS, deshaw);
    expect(out[0].summary).toMatch(/D\. E\. Shaw/);
    expect(out[0].summary).toMatch(/application link/i);
  });

  it("returns nothing for an empty list (off-season)", () => {
    expect(mapDeShawInternships([], deshaw)).toEqual([]);
  });
});
