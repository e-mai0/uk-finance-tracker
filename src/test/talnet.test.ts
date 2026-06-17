import { describe, expect, it } from "vitest";
import {
  canonicalTalNetUrl,
  mapTalNetBoard,
  parseTalNetDeadline,
} from "../ingestion/adapters/talnet";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const nomura: AdapterEmployer = { name: "Nomura", sector: "Investment Bank" };
const jefferies: AdapterEmployer = { name: "Jefferies", sector: "Investment Bank" };

// Real boards render each role as a tile div carrying data-oppid + data-title,
// an <a class="subject"> deep link, and label-based field cells. The field
// NUMBER is not stable across boards (Nomura: field-3 Location, field-4
// Deadline; Rothschild/Evercore: field-3 Deadline, no Location), so the parser
// must key off the label text, not the field index.
function card(opts: {
  id: number;
  pl: number;
  host: string;
  slug: string;
  title: string;
  location?: string;
  deadline?: string;
}): string {
  const href = `https://${opts.host}/vx/lang-en-GB/mobile-0/appcentre-1/brand-4/xf-7c9bacbaa0a0/candidate/so/pm/1/pl/${opts.pl}/opp/${opts.id}-${opts.slug}/en-GB`;
  const loc = opts.location
    ? `<div class="candidate-opp-field-3"><span class="candidate-opp-field-label">Location:</span> ${opts.location}</div>`
    : "";
  const dl = opts.deadline
    ? `<div class="candidate-opp-field-4"><span class="candidate-opp-field-label">Application Deadline:</span> ${opts.deadline}</div>`
    : "";
  return `
<li class="col-md-6 opp-container" id="oppid-${opts.id}" data-oppid="${opts.id}">
  <div class="opp_${opts.id} search_res details_row candidate-opp-tile" data-oppid="${opts.id}" data-title="${opts.title}">
    <div class="candidate-opp-field-1"><span class="candidate-opp-field-label">ID:</span> ${opts.id}</div>
    <h3 class="candidate-opp-field-2">
      <a class="subject" href="${href}">
        ${opts.title} </a>
    </h3>
    ${loc}${dl}
  </div>
</li>`;
}

describe("parseTalNetDeadline", () => {
  it("parses dd/mm/yyyy to ISO", () => {
    expect(parseTalNetDeadline("Deadline: 09/07/2026")).toBe("2026-07-09");
  });
  it("parses 'd Mon yyyy' to ISO", () => {
    expect(parseTalNetDeadline("9 Jul 2026")).toBe("2026-07-09");
  });
  it("parses the 4-letter 'Sept' boards emit", () => {
    expect(parseTalNetDeadline("30 Sept 2026")).toBe("2026-09-30");
  });
  it("returns null when absent", () => {
    expect(parseTalNetDeadline("Rolling")).toBeNull();
  });
});

describe("canonicalTalNetUrl", () => {
  it("strips the volatile session prefix (mobile/appcentre/brand/xf)", () => {
    const href =
      "https://jefferies.tal.net/vx/lang-en-GB/mobile-0/appcentre-1/brand-4/xf-7c9bacbaa0a0/candidate/so/pm/1/pl/2/opp/1813-2026-Equity-Research/en-GB";
    expect(canonicalTalNetUrl(href, "jefferies.tal.net")).toBe(
      "https://jefferies.tal.net/vx/candidate/so/pm/1/pl/2/opp/1813-2026-Equity-Research/en-GB",
    );
  });

  it("rebuilds a root-relative href against the board host without doubling", () => {
    const href =
      "/vx/lang-en-GB/mobile-0/brand-4/xf-abc/candidate/so/pm/1/pl/1/opp/1388-foo/en-GB";
    expect(canonicalTalNetUrl(href, "nomuracampus.tal.net")).toBe(
      "https://nomuracampus.tal.net/vx/candidate/so/pm/1/pl/1/opp/1388-foo/en-GB",
    );
  });

  it("is idempotent on an already-canonical url", () => {
    const u =
      "https://jefferies.tal.net/vx/candidate/so/pm/1/pl/2/opp/1813-foo/en-GB";
    expect(canonicalTalNetUrl(u, "jefferies.tal.net")).toBe(u);
  });
});

describe("mapTalNetBoard", () => {
  it("keeps a UK role identified by the Location cell even when the title omits the city", () => {
    const html = card({
      id: 1500,
      pl: 1,
      host: "nomuracampus.tal.net",
      slug: "2026-Global-Markets-Summer-Internship",
      title: "2026 Global Markets Summer Internship",
      location: "London",
      deadline: "9 Jul 2026",
    });
    const out = mapTalNetBoard(html, "https://nomuracampus.tal.net", nomura);
    expect(out).toHaveLength(1);
    expect(out[0].location).toBe("London");
    expect(out[0].deadlineAt).toBe("2026-07-09");
  });

  it("classifies a non-UK role by region instead of dropping it", () => {
    const html = card({
      id: 1388,
      pl: 1,
      host: "nomuracampus.tal.net",
      slug: "2026-Global-Markets-Summer-Internship-Paris",
      title: "2026 Global Markets Summer Internship", // title alone looks UK-eligible
      location: "Paris",
      deadline: "9 Jul 2026",
    });
    const out = mapTalNetBoard(html, "https://nomuracampus.tal.net", nomura);
    // Per ADR-003 the Paris role is now included and tagged region OTHER rather
    // than discarded.
    expect(out).toHaveLength(1);
    expect(out[0].location).toBe("Paris");
    expect(out[0].region).toBe("OTHER");
  });

  it("emits a canonical applicationUrl with the volatile session prefix stripped", () => {
    const html = card({
      id: 1600,
      pl: 2,
      host: "jefferies.tal.net",
      slug: "2026-Investment-Banking-Summer-Internship-London",
      title: "2026 Investment Banking Summer Internship - London",
    });
    const out = mapTalNetBoard(html, "https://jefferies.tal.net", jefferies);
    expect(out).toHaveLength(1);
    expect(out[0].applicationUrl).toBe(
      "https://jefferies.tal.net/vx/candidate/so/pm/1/pl/2/opp/1600-2026-Investment-Banking-Summer-Internship-London/en-GB",
    );
    expect(out[0].applicationUrl).toBe(out[0].sourceUrl);
  });

  it("does not borrow a neighbouring card's deadline when this card has none", () => {
    // Card with no deadline cell, immediately followed by one that has a deadline.
    const html =
      card({
        id: 1700,
        pl: 2,
        host: "jefferies.tal.net",
        slug: "2026-Investment-Banking-Summer-Internship-London",
        title: "2026 Investment Banking Summer Internship - London",
      }) +
      card({
        id: 1701,
        pl: 2,
        host: "jefferies.tal.net",
        slug: "2026-Markets-Summer-Internship-London",
        title: "2026 Markets Summer Internship - London",
        deadline: "1 Aug 2026",
      });
    const out = mapTalNetBoard(html, "https://jefferies.tal.net", jefferies);
    const first = out.find((o) => o.applicationUrl?.includes("/opp/1700-"));
    expect(first?.deadlineAt).toBeUndefined();
  });

  it("decodes HTML entities in the title", () => {
    const html = card({
      id: 1900,
      pl: 2,
      host: "jefferies.tal.net",
      slug: "2026-Equity-Sales-Trading-Summer-Internship-London",
      title: "2026 Equity Sales &amp; Trading Summer Internship - London (Nov&#39;26)",
    });
    const out = mapTalNetBoard(html, "https://jefferies.tal.net", jefferies);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe(
      "2026 Equity Sales & Trading Summer Internship - London (Nov'26)",
    );
  });

  it("dedupes a role whose opp link repeats in the page", () => {
    const one = card({
      id: 1800,
      pl: 1,
      host: "nomuracampus.tal.net",
      slug: "2026-IB-Summer-Internship-London",
      title: "2026 IB Summer Internship - London",
      location: "London",
    });
    const out = mapTalNetBoard(one + one, "https://nomuracampus.tal.net", nomura);
    expect(out).toHaveLength(1);
  });
});
