import { describe, expect, it } from "vitest";
import {
  classifyPosting,
  isUkLocation,
  inferRoleFamily,
  roleFamilyFromSector,
  detectProgrammeType,
  detectRegion,
} from "../ingestion/classify";

describe("isUkLocation", () => {
  it("accepts London and UK city names", () => {
    expect(isUkLocation("London")).toBe(true);
    expect(isUkLocation("London, United Kingdom")).toBe(true);
    expect(isUkLocation("Edinburgh")).toBe(true);
    expect(isUkLocation("Remote - UK")).toBe(true);
  });

  it("accepts multi-office strings that include a UK office", () => {
    expect(isUkLocation("London, New York, Hong Kong")).toBe(true);
  });

  it("rejects non-UK locations", () => {
    expect(isUkLocation("New York")).toBe(false);
    expect(isUkLocation("Paris")).toBe(false);
    expect(isUkLocation("")).toBe(false);
  });

  it('does not treat "Ukraine" as the word UK', () => {
    expect(isUkLocation("Kyiv, Ukraine")).toBe(false);
  });

  it("accepts the GB country code from structured data", () => {
    expect(isUkLocation("London, GB")).toBe(true);
    expect(isUkLocation("Hamburg, DE")).toBe(false);
  });
});

describe("inferRoleFamily", () => {
  it("routes quant titles to QUANT even when they mention trading", () => {
    expect(
      inferRoleFamily({ title: "Quantitative Trading Intern", location: "London" }),
    ).toBe("QUANT");
  });

  it("routes IB before generic tech keywords", () => {
    expect(
      inferRoleFamily({
        title: "Technology Analyst, Investment Banking",
        location: "London",
      }),
    ).toBe("IB");
  });

  it("routes machine-learning titles to QUANT even in a trading department", () => {
    expect(
      inferRoleFamily({
        title: "Machine Learning Researcher",
        location: "London",
        departments: ["Trading, Research, and Machine Learning"],
      }),
    ).toBe("QUANT");
  });

  it("routes engineering at a finance firm to QUANT", () => {
    expect(
      inferRoleFamily({
        title: "Software Engineer Intern",
        location: "London",
      }),
    ).toBe("QUANT");
  });

  it("uses departments as a strong signal", () => {
    expect(
      inferRoleFamily({
        title: "Summer Intern",
        location: "London",
        departments: ["Equity Research"],
      }),
    ).toBe("RESEARCH");
  });

  it("falls back to the description only when title/departments yield nothing", () => {
    expect(
      inferRoleFamily({
        title: "Summer Intern 2027",
        location: "London",
        descriptionText: "Join our private equity deal team in London.",
      }),
    ).toBe("PRIVATE_EQUITY");
  });
});

describe("roleFamilyFromSector", () => {
  it("maps common sector labels", () => {
    expect(roleFamilyFromSector("Hedge Fund")).toBe("HEDGE_FUND");
    expect(roleFamilyFromSector("Proprietary Trading")).toBe("QUANT");
    expect(roleFamilyFromSector("Asset Management")).toBe("ASSET_MGMT");
    expect(roleFamilyFromSector(null)).toBeNull();
  });
});

describe("detectProgrammeType", () => {
  it("defaults a plain summer internship to SUMMER_INTERNSHIP", () => {
    expect(detectProgrammeType({ title: "Summer Analyst", location: "London" })).toBe(
      "SUMMER_INTERNSHIP",
    );
    expect(
      detectProgrammeType({ title: "Investment Banking Intern", location: "London" }),
    ).toBe("SUMMER_INTERNSHIP");
  });

  it("detects spring weeks / insight programmes as SPRING_WEEK", () => {
    expect(detectProgrammeType({ title: "Spring Week 2027", location: "London" })).toBe(
      "SPRING_WEEK",
    );
    expect(
      detectProgrammeType({ title: "First-Year Insight Programme", location: "London" }),
    ).toBe("SPRING_WEEK");
    expect(
      detectProgrammeType({ title: "Discovery Day — Markets", location: "London" }),
    ).toBe("SPRING_WEEK");
  });

  it("folds winter internships into OFF_CYCLE (no separate WINTER value)", () => {
    expect(
      detectProgrammeType({ title: "Winter Internship — Sales & Trading", location: "London" }),
    ).toBe("OFF_CYCLE");
    expect(detectProgrammeType({ title: "Off-cycle Intern", location: "London" })).toBe(
      "OFF_CYCLE",
    );
  });

  it("detects placement-year / industrial-placement / apprenticeship as INDUSTRIAL_PLACEMENT", () => {
    expect(
      detectProgrammeType({ title: "Industrial Placement, Finance", location: "London" }),
    ).toBe("INDUSTRIAL_PLACEMENT");
    expect(
      detectProgrammeType({ title: "Placement Year Analyst", location: "London" }),
    ).toBe("INDUSTRIAL_PLACEMENT");
    expect(
      detectProgrammeType({ title: "12-month Placement — Risk", location: "London" }),
    ).toBe("INDUSTRIAL_PLACEMENT");
    expect(
      detectProgrammeType({ title: "Year in Industry Apprentice", location: "London" }),
    ).toBe("INDUSTRIAL_PLACEMENT");
  });

  it("honours precedence SPRING_WEEK > INDUSTRIAL_PLACEMENT > OFF_CYCLE > SUMMER", () => {
    // Spring beats everything else
    expect(
      detectProgrammeType({
        title: "Spring into Banking — Off-cycle Insight",
        location: "London",
      }),
    ).toBe("SPRING_WEEK");
    // Placement beats off-cycle and summer
    expect(
      detectProgrammeType({ title: "Summer Industrial Placement", location: "London" }),
    ).toBe("INDUSTRIAL_PLACEMENT");
    // Off-cycle beats summer
    expect(
      detectProgrammeType({ title: "Off-cycle Summer Cover Intern", location: "London" }),
    ).toBe("OFF_CYCLE");
  });
});

describe("detectRegion", () => {
  it("maps UK signals to UK", () => {
    expect(detectRegion("London")).toBe("UK");
    expect(detectRegion("Edinburgh, UK")).toBe("UK");
    expect(detectRegion("Canary Wharf")).toBe("UK");
  });

  it("maps unambiguous US signals to US", () => {
    expect(detectRegion("New York")).toBe("US");
    expect(detectRegion("Chicago, IL")).toBe("US");
    expect(detectRegion("Jersey City")).toBe("US");
    expect(detectRegion("Stamford")).toBe("US");
    expect(detectRegion("Houston, United States")).toBe("US");
  });

  it("maps Hong Kong signals to HK", () => {
    expect(detectRegion("Hong Kong")).toBe("HK");
    expect(detectRegion("HongKong")).toBe("HK");
    expect(detectRegion("Central, HK")).toBe("HK");
  });

  it("returns OTHER for everything else, including unrecognised cities", () => {
    expect(detectRegion("Paris")).toBe("OTHER");
    expect(detectRegion("Singapore")).toBe("OTHER");
    expect(detectRegion("")).toBe("OTHER");
  });

  it("SC3: a bare 2-letter ambiguous code is NOT treated as US (Toronto, CA → OTHER)", () => {
    // "CA" here is Canada's country code, not California — must not guess US.
    expect(detectRegion("Toronto, CA")).toBe("OTHER");
  });

  it("resolves multi-office strings UK-first", () => {
    expect(detectRegion("London, New York, Hong Kong")).toBe("UK");
    // A co-listed UK office wins even when an ambiguous Canada code is present.
    expect(detectRegion("Toronto, CA; London")).toBe("UK");
  });

  it("does not treat Ukraine as the UK", () => {
    expect(detectRegion("Kyiv, Ukraine")).toBe("OTHER");
  });
});

describe("classifyPosting", () => {
  it("includes a classic summer analyst posting", () => {
    const v = classifyPosting({
      title: "Investment Banking Summer Analyst 2027",
      location: "London",
    });
    expect(v).toEqual({
      include: true,
      roleFamily: "IB",
      via: "keyword",
      programmeType: "SUMMER_INTERNSHIP",
      region: "UK",
    });
  });

  it("includes when the ATS employment type says Intern but title doesn't", () => {
    const v = classifyPosting({
      title: "Trading Assistant (Summer 2027)",
      location: "London",
      employmentType: "Intern",
    });
    expect(v.include).toBe(true);
  });

  it('does not treat "International" as an internship signal', () => {
    expect(
      classifyPosting({ title: "International Tax Manager", location: "London" }),
    ).toEqual({ include: false, reason: "not-internship" });
  });

  it('does not let "Undergraduate" trip the graduate exclusion', () => {
    const v = classifyPosting({
      title: "Software Engineer Intern (Undergraduate)",
      location: "London",
    });
    expect(v.include).toBe(true);
  });

  it("excludes graduate / full-time roles", () => {
    expect(
      classifyPosting({ title: "Graduate Analyst", location: "London" }),
    ).toEqual({ include: false, reason: "not-internship" });
    expect(
      classifyPosting({ title: "Quantitative Researcher", location: "London" }),
    ).toEqual({ include: false, reason: "not-internship" });
  });

  // NOTE (ADR-003 sanctioned replacement): the two cases that previously pinned
  // discarding Spring Weeks / off-cycle ("wrong-season") and non-UK postings
  // ("not-uk") are replaced below with classification-asserting cases. The
  // classifier now TAGS season + region instead of dropping these roles.
  it("classifies spring weeks, off-cycle and placements instead of discarding", () => {
    expect(
      classifyPosting({ title: "Spring Insight Week", location: "London" }, "IB"),
    ).toEqual({
      include: true,
      roleFamily: "IB",
      via: "fallback",
      programmeType: "SPRING_WEEK",
      region: "UK",
    });
    expect(
      classifyPosting({
        title: "Off-cycle Intern, Sales & Trading",
        location: "London",
      }),
    ).toEqual({
      include: true,
      roleFamily: "MARKETS",
      via: "keyword",
      programmeType: "OFF_CYCLE",
      region: "UK",
    });
    expect(
      classifyPosting(
        { title: "Industrial Placement — Finance (12 months)", location: "London" },
        "IB",
      ),
    ).toEqual({
      include: true,
      roleFamily: "IB",
      via: "fallback",
      programmeType: "INDUSTRIAL_PLACEMENT",
      region: "UK",
    });
  });

  it("classifies region instead of discarding non-UK postings", () => {
    expect(
      classifyPosting({ title: "Summer Analyst, M&A", location: "New York" }),
    ).toEqual({
      include: true,
      roleFamily: "IB",
      via: "keyword",
      programmeType: "SUMMER_INTERNSHIP",
      region: "US",
    });
    expect(
      classifyPosting({ title: "Summer Analyst, M&A", location: "Hong Kong" }),
    ).toEqual({
      include: true,
      roleFamily: "IB",
      via: "keyword",
      programmeType: "SUMMER_INTERNSHIP",
      region: "HK",
    });
    expect(
      classifyPosting({ title: "Summer Analyst, M&A", location: "Paris" }),
    ).toEqual({
      include: true,
      roleFamily: "IB",
      via: "keyword",
      programmeType: "SUMMER_INTERNSHIP",
      region: "OTHER",
    });
  });

  it("excludes non-finance functions even at a finance firm", () => {
    expect(
      classifyPosting(
        { title: "People Operations Intern", location: "London" },
        "HEDGE_FUND",
      ),
    ).toEqual({ include: false, reason: "not-finance" });
  });

  it("uses the sector fallback for generic intern titles at a known firm", () => {
    expect(
      classifyPosting(
        { title: "Summer Internship 2027", location: "London" },
        "HEDGE_FUND",
      ),
    ).toEqual({
      include: true,
      roleFamily: "HEDGE_FUND",
      via: "fallback",
      programmeType: "SUMMER_INTERNSHIP",
      region: "UK",
    });
  });

  it("excludes generic intern titles when nothing identifies the function", () => {
    expect(
      classifyPosting({ title: "Summer Internship 2027", location: "London" }),
    ).toEqual({ include: false, reason: "not-finance" });
  });
});
