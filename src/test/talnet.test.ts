import { describe, expect, it } from "vitest";
import { mapTalNetBoard, parseTalNetDeadline } from "../ingestion/adapters/talnet";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const nomura: AdapterEmployer = { name: "Nomura", sector: "Investment Bank" };
const jefferies: AdapterEmployer = { name: "Jefferies", sector: "Investment Bank" };

// Live boards emit FULLY-QUALIFIED hrefs (href="https://host/vx/…"), not the
// root-relative form. This fixture mirrors the real jefferies.tal.net markup.
const ABSOLUTE_HTML = `
<a class="card" href="https://jefferies.tal.net/vx/lang-en-GB/mobile-0/appcentre-1/brand-4/xf-228143dcd2bb/candidate/so/pm/1/pl/2/opp/1637-2026-Investment-Banking-Summer-Internship-London/en-GB"> 2026 Investment Banking Summer Internship - London </a>
<span class="deadline">Deadline: 09/07/2026</span>`;

const HTML = `
<a href="/vx/lang-en-GB/mobile-0/brand-4/xf-abc/candidate/so/pm/1/pl/1/opp/1388-investment-banking-summer-internship-london/en-GB">
  Investment Banking Summer Internship - London</a>
<span class="deadline">Deadline: 09/07/2026</span>
<a href="/vx/lang-en-GB/mobile-0/brand-4/xf-abc/candidate/so/pm/1/pl/1/opp/1390-global-markets-summer-internship-tokyo/en-GB">
  Global Markets Summer Internship - Tokyo</a>`;

describe("parseTalNetDeadline", () => {
  it("parses dd/mm/yyyy to ISO", () => {
    expect(parseTalNetDeadline("Deadline: 09/07/2026")).toBe("2026-07-09");
  });
  it("parses 'd Mon yyyy' to ISO", () => {
    expect(parseTalNetDeadline("9 Jul 2026")).toBe("2026-07-09");
  });
  it("returns null when absent", () => {
    expect(parseTalNetDeadline("Rolling")).toBeNull();
  });
});

describe("mapTalNetBoard", () => {
  it("keeps London summer internships with canonical URLs and deadlines", () => {
    const out = mapTalNetBoard(HTML, "https://nomuracampus.tal.net", nomura);
    expect(out).toHaveLength(1);
    expect(out[0].applicationUrl).toContain("/opp/1388-");
    expect(out[0].applicationUrl?.startsWith("https://nomuracampus.tal.net/vx/")).toBe(true);
    expect(out[0].deadlineAt).toBe("2026-07-09");
    expect(out[0].sourceType).toBe("TALNET");
  });

  it("parses fully-qualified hrefs from a live board without doubling the host", () => {
    const out = mapTalNetBoard(ABSOLUTE_HTML, "https://jefferies.tal.net", jefferies);
    expect(out).toHaveLength(1);
    expect(out[0].applicationUrl).toBe(
      "https://jefferies.tal.net/vx/lang-en-GB/mobile-0/appcentre-1/brand-4/xf-228143dcd2bb/candidate/so/pm/1/pl/2/opp/1637-2026-Investment-Banking-Summer-Internship-London/en-GB",
    );
    expect(out[0].deadlineAt).toBe("2026-07-09");
  });
});
