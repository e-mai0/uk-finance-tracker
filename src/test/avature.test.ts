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
  it("keeps London internships keyed on jobId", () => {
    const out = mapMacquarie(HTML, "https://recruitment.macquarie.com", mq);
    expect(out).toHaveLength(1);
    expect(out[0].applicationUrl).toContain("jobId=22679");
    expect(out[0].sourceType).toBe("AVATURE");
  });
});
