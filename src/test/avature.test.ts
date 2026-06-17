import { describe, expect, it } from "vitest";
import { mapMacquarie } from "../ingestion/adapters/avature";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const mq: AdapterEmployer = { name: "Macquarie", sector: "Investment Bank" };

const HTML = `<article class="article--result">
  <a href="/en_US/careers/JobDetail?jobId=22679">2026 Macquarie Summer Internship - London</a>
  <img alt="Office Location:"><span>London, UK</span></article>
<article class="article--result">
  <a href="/en_US/careers/JobDetail?jobId=22680">2026 Macquarie Summer Internship - Sao Paulo</a>
  <img alt="Office Location:"><span>Sao Paulo</span></article>`;

describe("mapMacquarie", () => {
  it("keeps only the UK internship and excludes the non-UK one (UK-only, ADR-005)", () => {
    const out = mapMacquarie(HTML, "https://recruitment.macquarie.com", mq);
    // ADR-005 (UK-only): just the London intern (22679) survives; the São Paulo
    // intern (22680) is excluded again as not-uk.
    expect(out).toHaveLength(1);

    const london = out.find((o) => o.applicationUrl?.includes("jobId=22679"));
    expect(london).toBeDefined();
    expect(london!.sourceType).toBe("AVATURE");
    expect(london!.programmeType).toBe("SUMMER_INTERNSHIP");

    // The São Paulo role is excluded again (UK-only gate restored).
    expect(out.find((o) => o.applicationUrl?.includes("jobId=22680"))).toBeUndefined();
  });
});
