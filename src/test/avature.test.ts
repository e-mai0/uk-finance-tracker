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
  it("keeps both internships keyed on jobId and classifies them by region", () => {
    const out = mapMacquarie(HTML, "https://recruitment.macquarie.com", mq);
    // London intern (22679) + São Paulo intern (22680, now classified with
    // region OTHER rather than discarded per ADR-003).
    expect(out).toHaveLength(2);

    const london = out.find((o) => o.applicationUrl?.includes("jobId=22679"));
    expect(london).toBeDefined();
    expect(london!.sourceType).toBe("AVATURE");
    expect(london!.region).toBe("UK");

    // The previously-dropped São Paulo role is now present AND tagged region OTHER.
    const saoPaulo = out.find((o) => o.applicationUrl?.includes("jobId=22680"));
    expect(saoPaulo).toBeDefined();
    expect(saoPaulo!.region).toBe("OTHER");
  });
});
