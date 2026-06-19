import { describe, expect, it } from "vitest";
import {
  mapSuccessFactorsTiles,
  csbTileLocation,
} from "../ingestion/adapters/successfactors";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const am: AdapterEmployer = { name: "Asset Manager plc", sector: "Asset Manager" };
const HOST = "https://careers.example.com";

// Rich CSB tile (Partners Group style): authoritative location-value element.
function richTile(id: string, dataUrl: string, title: string, loc: string): string {
  return `
<li class="job-tile job-id-${id} job-row-index-1 linkhoverX" data-url="${dataUrl}" data-row-index="1" data-focus-tile=".job-id-${id}">
  <div class="job-tile-cell"><div class="row job">
    <div class="col-md-12 sub-section sub-section-desktop hidden-xs hidden-sm">
      <div class="tiletitle"><span class="sr-only">Title</span>
        <span class="section-title title" role="heading" aria-level="2">
          <a class="jobTitle-link fontcolorX" data-focus-tile=".job-id-${id}" href="${dataUrl}">
            ${title}
          </a>
        </span>
      </div>
      <div id="job-${id}-desktop-section-location" class="section-field location">
        <span id="job-${id}-desktop-section-location-label" aria-describedby="job-${id}-desktop-section-location-value" class="section-label">Location</span>
        <div id="job-${id}-desktop-section-location-value">${loc}</div>
      </div>
    </div>
  </div></div>
</li>`;
}

// Minimal CSB tile (Janus / Mizuho style): NO location element — location lives
// only in the data-url slug prefix. Title is repeated for desktop/tablet/mobile.
function minimalTile(id: string, dataUrl: string, title: string): string {
  const titleSpan = `
      <div class="tiletitle"><span class="sr-only">Title</span>
        <span class="section-title title" role="heading" aria-level="2">
          <a class="jobTitle-link fontcolorX" data-focus-tile=".job-id-${id}" href="${dataUrl}">
            ${title}
          </a>
        </span>
      </div>`;
  return `
<li class="job-tile job-id-${id} job-row-index-1 linkhoverX" data-url="${dataUrl}" data-row-index="1" data-focus-tile=".job-id-${id}">
  <div class="job-tile-cell"><div class="row job">
    <div class="col-md-12 sub-section sub-section-desktop hidden-xs hidden-sm">${titleSpan}</div>
    <div class="col-md-12 sub-section sub-section-tablet hidden-xs hidden-md hidden-lg">${titleSpan}</div>
    <div class="col-md-12 sub-section sub-section-mobile hidden-sm hidden-md hidden-lg">${titleSpan}</div>
  </div></div>
</li>`;
}

describe("csbTileLocation", () => {
  it("strips the known title off the slug to isolate the location prefix", () => {
    expect(
      csbTileLocation("/job/London-Senior-Treasury-Analyst-EC2M-3AE/1384037600/", "Senior Treasury Analyst"),
    ).toBe("London");
  });

  it("recovers multi-word cities (so they gate correctly)", () => {
    expect(
      csbTileLocation("/job/New-York-Summer-Analyst-Internship/456/", "Summer Analyst Internship"),
    ).toBe("New York");
  });

  it("decodes URL-encoded punctuation in the title portion", () => {
    expect(
      csbTileLocation("/job/Singapore-Investment-Leader-%28INFRA-Directs%29/1395431733/", "Investment Leader (INFRA Directs)"),
    ).toBe("Singapore");
  });

  it("falls back to the leading slug token when the title is not found", () => {
    expect(csbTileLocation("/job/Edinburgh-Some-Other-Title/9/", "Mismatched Title")).toBe("Edinburgh");
  });

  it("recovers the location from the suffix when the title leads the slug", () => {
    // Title-first tenant ordering: {Title}-{City}. The city must still be found.
    expect(csbTileLocation("/job/Summer-Internship-Manchester/7/", "Summer Internship")).toBe("Manchester");
  });

  it("matches the title on token boundaries, not as a substring", () => {
    // "Intern" must NOT match inside "Internationale" (which would corrupt the
    // location). Title tokens are compared whole, so the location is intact.
    expect(
      csbTileLocation("/job/Internationale-Group-Summer-Intern/3/", "Summer Intern"),
    ).toBe("Internationale Group");
  });
});

describe("mapSuccessFactorsTiles", () => {
  it("includes a UK internship from a rich tile, reading the location-value", () => {
    const html = richTile(
      "111",
      "/job/London-Summer-Internship-Investments-2027/111/",
      "Summer Internship - Investments, 2027",
      "London, GB",
    );
    const out = mapSuccessFactorsTiles(html, HOST, am);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Summer Internship - Investments, 2027");
    expect(out[0].location).toBe("London, GB");
    expect(out[0].programmeType).toBe("SUMMER_INTERNSHIP");
    expect(out[0].status).toBe("OPEN");
    expect(out[0].sourceType).toBe("SUCCESSFACTORS");
    expect(out[0].applicationUrl).toBe(
      "https://careers.example.com/job/London-Summer-Internship-Investments-2027/111/",
    );
  });

  it("excludes a non-UK internship from a rich tile", () => {
    const html = richTile("222", "/job/Singapore-Summer-Internship/222/", "Summer Internship", "Singapore, SG");
    expect(mapSuccessFactorsTiles(html, HOST, am)).toHaveLength(0);
  });

  it("includes a UK Spring Week from a minimal tile via the slug prefix", () => {
    const html = minimalTile("333", "/job/London-Spring-Insight-Programme-2027/333/", "Spring Insight Programme 2027");
    const out = mapSuccessFactorsTiles(html, HOST, am);
    expect(out).toHaveLength(1);
    expect(out[0].location).toBe("London");
    expect(out[0].programmeType).toBe("SPRING_WEEK");
  });

  it("excludes a non-UK internship from a minimal tile (slug-derived location)", () => {
    const html = minimalTile("444", "/job/New-York-Summer-Analyst-Internship/444/", "Summer Analyst Internship");
    expect(mapSuccessFactorsTiles(html, HOST, am)).toHaveLength(0);
  });

  it("excludes a full-time role (not-internship)", () => {
    const html = minimalTile("555", "/job/London-Managing-Director-Markets/555/", "Managing Director, Markets");
    expect(mapSuccessFactorsTiles(html, HOST, am)).toHaveLength(0);
  });

  it("parses multiple tiles and dedupes the triplicated title (one row per tile)", () => {
    const html =
      richTile("111", "/job/London-Summer-Internship-2027/111/", "Summer Internship 2027", "London, GB") +
      minimalTile("333", "/job/Edinburgh-Off-Cycle-Internship/333/", "Off-Cycle Internship");
    const out = mapSuccessFactorsTiles(html, HOST, am);
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.title).sort()).toEqual(["Off-Cycle Internship", "Summer Internship 2027"]);
  });

  it("never republishes employer copy — summary is templated", () => {
    const html = richTile("111", "/job/London-Summer-Internship-2027/111/", "Summer Internship 2027", "London, GB");
    const [o] = mapSuccessFactorsTiles(html, HOST, am);
    expect(o.summary).toContain("SuccessFactors");
    expect(o.summary).toContain("Asset Manager plc");
  });

  it("returns an empty list for HTML with no job tiles", () => {
    expect(mapSuccessFactorsTiles("<html><body>No results</body></html>", HOST, am)).toEqual([]);
  });

  it("parses a tile whose data-url attribute precedes the job-id class (order-agnostic)", () => {
    // SAP CSB does not guarantee attribute order; the parser must not silently
    // drop a tile just because data-url comes before the job-id class.
    const html = `
<li data-url="/job/London-Summer-Internship-2027/888/" class="job-tile job-id-888 linkhoverX" data-row-index="1">
  <a class="jobTitle-link" href="/job/London-Summer-Internship-2027/888/">Summer Internship 2027</a>
</li>`;
    const out = mapSuccessFactorsTiles(html, HOST, am);
    expect(out).toHaveLength(1);
    expect(out[0].location).toBe("London");
    expect(out[0].applicationUrl).toBe("https://careers.example.com/job/London-Summer-Internship-2027/888/");
  });

  it("includes a UK minimal-tile role where the city is NOT the first slug segment", () => {
    // Title-first slug ordering: {Title}-{City}. The UK gate must still pass.
    const html = minimalTile("999", "/job/Off-Cycle-Internship-Birmingham/999/", "Off-Cycle Internship");
    const out = mapSuccessFactorsTiles(html, HOST, am);
    expect(out).toHaveLength(1);
    expect(out[0].location).toBe("Birmingham");
    expect(out[0].programmeType).toBe("OFF_CYCLE");
  });
});
