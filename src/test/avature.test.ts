import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapMacquarie, mapTwoSigma } from "../ingestion/adapters/avature";
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

const ts: AdapterEmployer = { name: "Two Sigma", sector: "Hedge Fund" };
const TS_BASE = "https://careers.twosigma.com";
const TS_FIXTURE = readFileSync(
  fileURLToPath(new URL("./fixtures/twosigma-open-roles.html", import.meta.url)),
  "utf8",
);

describe("mapTwoSigma", () => {
  it("parses the UK early-careers role and excludes experienced / non-UK rows", () => {
    const out = mapTwoSigma(TS_FIXTURE, TS_BASE, ts);

    // Only the London early-careers internship survives classify; the London
    // "Experienced" role (not-internship) and the New York campus role (not-uk)
    // are both dropped.
    expect(out).toHaveLength(1);

    const role = out[0];
    expect(role.employer).toBe("Two Sigma");
    expect(role.title).toBe("Quantitative Research Summer Internship");
    expect(role.location).toBe("London");
    expect(role.programmeType).toBe("SUMMER_INTERNSHIP");
    expect(role.sourceType).toBe("AVATURE");
    // Absolute apply/detail URL points at the real JobDetail page (id 13912).
    expect(role.applicationUrl).toBe(
      `${TS_BASE}/careers/JobDetail/London-United-Kingdom-of-Great-Britain-and-Northern-Ireland-Quantitative-Research-Summer-Internship/13912`,
    );
    expect(role.applicationUrl).toBe(role.sourceUrl);
    // No copied employer description — summary is our templated original.
    expect(role.summary).toContain("Listed live on the employer's");

    // Experienced London role excluded (not-internship), not parsed in.
    expect(out.find((o) => o.applicationUrl?.includes("13936"))).toBeUndefined();
    // New York campus role excluded (not-uk).
    expect(out.find((o) => o.applicationUrl?.includes("13671"))).toBeUndefined();
  });

  it("dedupes repeated job ids (footer 'View role' links share the id)", () => {
    const out = mapTwoSigma(TS_FIXTURE, TS_BASE, ts);
    const ids = out.map((o) => o.applicationUrl);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns [] for a malformed/empty body", () => {
    expect(mapTwoSigma("", TS_BASE, ts)).toEqual([]);
    expect(mapTwoSigma("<html><body>no jobs here</body></html>", TS_BASE, ts)).toEqual([]);
  });
});
