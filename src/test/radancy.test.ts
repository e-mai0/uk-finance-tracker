import { describe, expect, it } from "vitest";
import { mapRadancy } from "../ingestion/adapters/radancy";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const br: AdapterEmployer = { name: "BlackRock", sector: "Asset Management" };

const RESULTS = `<section id="search-results" data-total-results="1" data-total-pages="1">
<ul><li><a href="/job/london/2026-summer-internship-emea/45831/90599500992" data-job-id="90599500992">
<h2>2026 Summer Internship Programme EMEA</h2></a><span class="job-location">London, United Kingdom</span></li></ul></section>`;

describe("mapRadancy", () => {
  it("parses the JSON-wrapped HTML into UK internships keyed on jobId", () => {
    const out = mapRadancy({ results: RESULTS }, "https://careers.blackrock.com", br);
    expect(out).toHaveLength(1);
    expect(out[0].applicationUrl).toBe("https://careers.blackrock.com/job/london/2026-summer-internship-emea/45831/90599500992");
    expect(out[0].sourceType).toBe("RADANCY");
  });
  it("throws when results html is missing", () => {
    expect(() => mapRadancy({}, "https://x", br)).toThrow(/results/);
  });
});
