import { describe, expect, it } from "vitest";
import {
  classifyPosting,
  isUkLocation,
  inferRoleFamily,
  roleFamilyFromSector,
  detectProgrammeType,
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

  it("detects placement-year / industrial-placement as INDUSTRIAL_PLACEMENT", () => {
    expect(
      detectProgrammeType({ title: "Industrial Placement, Finance", location: "London" }),
    ).toBe("INDUSTRIAL_PLACEMENT");
    expect(
      detectProgrammeType({ title: "Placement Year Analyst", location: "London" }),
    ).toBe("INDUSTRIAL_PLACEMENT");
    expect(
      detectProgrammeType({ title: "12-month Placement — Risk", location: "London" }),
    ).toBe("INDUSTRIAL_PLACEMENT");
  });

  // ----- Phase 2: sharpened taxonomy (ADR-005, uk-programme-taxonomy.md) -----

  // Precedence CHANGED to INDUSTRIAL_PLACEMENT > SPRING_WEEK > OFF_CYCLE > SUMMER
  // (research §"Precedence rule"): industrial placement is the most specific,
  // rarely-wrong UK signal, so it now outranks spring week.
  it("honours the new precedence INDUSTRIAL_PLACEMENT > SPRING_WEEK > OFF_CYCLE > SUMMER", () => {
    // Placement now beats spring (changed from the old SPRING-first order):
    // "Summer Industrial Placement starting Spring 2027" is a placement year.
    expect(
      detectProgrammeType({
        title: "Summer Industrial Placement starting Spring 2027",
        location: "London",
      }),
    ).toBe("INDUSTRIAL_PLACEMENT");
    // Spring still beats off-cycle and summer.
    expect(
      detectProgrammeType({
        title: "Spring Off-Cycle Insight Week",
        location: "London",
      }),
    ).toBe("SPRING_WEEK");
    // Placement beats off-cycle (both can be "12-month").
    expect(
      detectProgrammeType({
        title: "12-month Industrial Placement (off-cycle intake)",
        location: "London",
      }),
    ).toBe("INDUSTRIAL_PLACEMENT");
    // Off-cycle beats the summer default.
    expect(
      detectProgrammeType({ title: "Off-cycle Summer Cover Intern", location: "London" }),
    ).toBe("OFF_CYCLE");
  });

  it("recognises new SPRING_WEEK insight/first-year/diversity signals", () => {
    for (const title of [
      "Spring into JPMorganChase 2027",
      "UK Insight Programme",
      "Insight Day — Global Markets",
      "Sophomore Insight Series",
      "1st Year Spring Insight",
      "Women's Insight Programme",
      "Black Heritage Insight Week",
      "Social Mobility Insight Evening",
      "Markets Immersion Programme",
      "Women's Horizons Programme",
      "Explore Banking — Early Insight",
      "Spotlight Insight Day",
    ]) {
      expect(detectProgrammeType({ title, location: "London" })).toBe("SPRING_WEEK");
    }
  });

  // Guard (research edge case 1): a bare "Spring <year>" START DATE must NOT be
  // read as a spring week — only spring + insight/week/first-year/"spring into".
  it("does NOT read a bare 'Spring 2027' start date as SPRING_WEEK", () => {
    expect(
      detectProgrammeType({ title: "Summer Analyst — Spring 2027 start", location: "London" }),
    ).toBe("SUMMER_INTERNSHIP");
    expect(
      detectProgrammeType({ title: "Investment Banking Internship (Spring 2027)", location: "London" }),
    ).toBe("SUMMER_INTERNSHIP");
  });

  it("recognises new OFF_CYCLE signals (off-cycle / winter / 3-6 month / rolling)", () => {
    for (const title of [
      "Off-Cycle Internship — IBD",
      "Off Cycle Intern, Markets",
      "Winter Internship — Equity Research",
      "6-month Internship, Private Credit",
      "3-month Internship — Coverage",
      "Rolling Internship Programme",
      "Quarterly Intake Internship",
    ]) {
      expect(detectProgrammeType({ title, location: "London" })).toBe("OFF_CYCLE");
    }
  });

  it("recognises new INDUSTRIAL_PLACEMENT signals (year/sandwich/industrial qualifiers)", () => {
    for (const title of [
      "Year in Industry — Risk",
      "Sandwich Placement, Finance",
      "Sandwich Year Analyst",
      "Industrial Year Trainee",
      "12-month Industrial Placement Year Programme",
    ]) {
      expect(detectProgrammeType({ title, location: "London" })).toBe("INDUSTRIAL_PLACEMENT");
    }
  });

  // Research edge case 5 / bucket-4 note: bare "placement" is OVERLOADED in the
  // UK — require a year/sandwich/industrial qualifier. A 6-week summer placement
  // is a summer internship, not an industrial placement.
  it("does NOT classify a bare 'placement' as INDUSTRIAL_PLACEMENT", () => {
    expect(
      detectProgrammeType({ title: "Summer Placement (6 weeks) — Markets", location: "London" }),
    ).toBe("SUMMER_INTERNSHIP");
    expect(
      detectProgrammeType({ title: "Trading Floor Placement Intern", location: "London" }),
    ).toBe("SUMMER_INTERNSHIP");
  });

  it("recognises new SUMMER_INTERNSHIP signals and keeps it as the default sink", () => {
    expect(
      detectProgrammeType({ title: "Penultimate Year Summer Internship", location: "London" }),
    ).toBe("SUMMER_INTERNSHIP");
    expect(
      detectProgrammeType({ title: "Summer Associate, M&A", location: "London" }),
    ).toBe("SUMMER_INTERNSHIP");
    // Default sink: a bare intern with no other bucket signal.
    expect(
      detectProgrammeType({ title: "Markets Intern 2027", location: "London" }),
    ).toBe("SUMMER_INTERNSHIP");
  });
});

// Exclusions added in Phase 2 (research §"Recommended EXCLUDE signals", edge
// cases 3 & 10). These run BEFORE programme-type assignment in classifyPosting.
describe("classifyPosting — Phase 2 exclusions", () => {
  // Pre-University / school-leaver (the-trackr has a separate Pre-University
  // tab; we have no bucket). The guard MUST run before programme-type so a
  // "Spring Insight for Year 12 students" is excluded, not tagged SPRING_WEEK.
  it("excludes pre-university / school-leaver insight programmes", () => {
    for (const title of [
      "Spring Insight Week for Year 12 Students",
      "School Leaver Insight Programme",
      "Sixth Form Discovery Day — Banking",
      "Pre-University Insight, Markets",
      "A-Level Insight Day",
      "Insight Programme for Students Aged 16",
    ]) {
      const v = classifyPosting({ title, location: "London" }, "IB");
      expect(v.include).toBe(false);
      if (!v.include) expect(v.reason).toBe("pre-university");
    }
  });

  it("does NOT pull a school-leaver insight into SPRING_WEEK (exclusion runs first)", () => {
    const v = classifyPosting(
      { title: "Spring Insight for Year 13 — Investment Banking", location: "London" },
      "IB",
    );
    expect(v).toEqual({ include: false, reason: "pre-university" });
  });

  // Off-cycle return-offer / FT conversion (research edge case 3): off-cycle +
  // full-time/permanent with NO intern token is a full-time role, not an intern.
  it("excludes an off-cycle full-time/return-offer role (no intern token)", () => {
    expect(
      classifyPosting(
        { title: "Off-Cycle Analyst — Full-Time, M&A", location: "London" },
        "IB",
      ),
    ).toEqual({ include: false, reason: "not-internship" });
    expect(
      classifyPosting(
        { title: "Off-Cycle Permanent Associate, Markets", location: "London" },
        "IB",
      ),
    ).toEqual({ include: false, reason: "not-internship" });
  });

  it("STILL includes a genuine off-cycle INTERNSHIP (has an intern token)", () => {
    const v = classifyPosting(
      { title: "Off-Cycle Internship — M&A", location: "London" },
      "IB",
    );
    expect(v.include).toBe(true);
    if (v.include) expect(v.programmeType).toBe("OFF_CYCLE");
  });

  // AC carry-over: graduate / FT / experienced-hire roles stay excluded.
  it("keeps graduate / full-time / VP roles excluded", () => {
    expect(
      classifyPosting({ title: "Graduate Analyst Programme", location: "London" }),
    ).toEqual({ include: false, reason: "not-internship" });
    expect(
      classifyPosting({ title: "VP, M&A", location: "London" }),
    ).toEqual({ include: false, reason: "not-internship" });
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

  // NOTE (ADR-003): the classifier TAGS programme season instead of discarding
  // Spring Weeks / off-cycle / placements (the retained bug fix). Region is gone
  // (ADR-005, UK-only) so these no longer carry a `region` field.
  it("classifies spring weeks, off-cycle and placements instead of discarding", () => {
    expect(
      classifyPosting({ title: "Spring Insight Week", location: "London" }, "IB"),
    ).toEqual({
      include: true,
      roleFamily: "IB",
      via: "fallback",
      programmeType: "SPRING_WEEK",
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
    });
  });

  // UK-only gate (ADR-005): a non-UK-located finance internship is EXCLUDED
  // (`not-uk`), even though it is a real summer internship at a finance firm —
  // the board is UK-pure. This restores the gate ADR-003 had removed.
  it("excludes a non-UK finance internship with reason not-uk", () => {
    expect(
      classifyPosting({ title: "Summer Analyst, M&A", location: "New York" }),
    ).toEqual({ include: false, reason: "not-uk" });
    expect(
      classifyPosting({ title: "Summer Analyst, M&A", location: "Hong Kong" }),
    ).toEqual({ include: false, reason: "not-uk" });
    expect(
      classifyPosting({ title: "Summer Analyst, M&A", location: "Paris" }),
    ).toEqual({ include: false, reason: "not-uk" });
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
    });
  });

  it("excludes generic intern titles when nothing identifies the function", () => {
    expect(
      classifyPosting({ title: "Summer Internship 2027", location: "London" }),
    ).toEqual({ include: false, reason: "not-finance" });
  });
});
