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
    // A branded word ("Discovery") PLUS an insight co-token is still SPRING_WEEK.
    expect(
      detectProgrammeType({ title: "Discovery Insight Day — Markets", location: "London" }),
    ).toBe("SPRING_WEEK");
  });

  // Cycle 3e PRECISION FIX (uk-programme-taxonomy.md, Bucket 1 row:
  // "explore / discover / spotlight / immersion / horizons (when paired with a
  // year-1 / insight signal)"). The five generic/branded words must NOT, on
  // their own, force SPRING_WEEK over a real Summer role. A branded word ALONE
  // → falls through to SUMMER (the default sink); a branded word + an
  // insight/year-1 co-token → SPRING_WEEK.
  describe("generic Spring-Week signals require an insight/year-1 co-token", () => {
    // The 5 reported false-positives: each literally a Summer/penultimate role
    // carrying a bare branded word — must classify SUMMER_INTERNSHIP, not
    // SPRING_WEEK.
    it("does NOT label a real Summer role SPRING_WEEK on a bare branded word", () => {
      for (const title of [
        "Data Engineering Summer Internship - Immersion Lab",
        "Quantitative Trading Internship (Spotlight Program)",
        "Software Engineering Internship - Horizon",
        "Discovery Software Engineer Internship",
        "Explore Quantitative Research - Summer Internship",
      ]) {
        expect(detectProgrammeType({ title, location: "London" })).toBe(
          "SUMMER_INTERNSHIP",
        );
      }
    });

    // A bare branded word with NO co-token and NO summer word also falls through
    // to the SUMMER default sink (it is no longer a SPRING_WEEK on its own).
    it("treats a bare branded word (no co-token) as the SUMMER default sink", () => {
      for (const title of [
        "Markets Immersion Programme",
        "Discovery Day — Markets",
        "Spotlight Programme — Banking",
        "Horizon Programme — Technology",
        "Explore Programme — Investment Banking",
      ]) {
        expect(detectProgrammeType({ title, location: "London" })).toBe(
          "SUMMER_INTERNSHIP",
        );
      }
    });

    // Held-out: each branded word WITH a co-token still fires SPRING_WEEK.
    it("STILL labels a branded word + insight/year-1/diversity co-token SPRING_WEEK", () => {
      for (const title of [
        "Discovery Insight Programme",
        "Explore Banking — Early Insight",
        "Spotlight Insight Day",
        "Markets Immersion — First-Year Insight",
        "Women's Horizons Programme",
        "Sophomore Spotlight Series",
        "Spring Discovery Week",
      ]) {
        expect(detectProgrammeType({ title, location: "London" })).toBe("SPRING_WEEK");
      }
    });
  });

  it("folds winter internships into OFF_CYCLE (no separate WINTER value)", () => {
    expect(
      detectProgrammeType({ title: "Winter Internship — Sales & Trading", location: "London" }),
    ).toBe("OFF_CYCLE");
    expect(detectProgrammeType({ title: "Off-cycle Intern", location: "London" })).toBe(
      "OFF_CYCLE",
    );
  });

  // ----- Phase 3 (ADR-006): industrial placement is now an EXCLUSION, not a
  // tracked bucket. detectProgrammeType only ever returns the 3 retained
  // buckets; placement-year titles are excluded by classifyPosting (asserted in
  // the "industrial-placement exclusion" block below). The detectProgrammeType
  // precedence is now SPRING_WEEK > OFF_CYCLE > SUMMER_INTERNSHIP (default sink).

  // ----- Phase 2: sharpened taxonomy (ADR-005, uk-programme-taxonomy.md) -----

  // Precedence (ADR-006): SPRING_WEEK > OFF_CYCLE > SUMMER. (The industrial-
  // placement arm was removed; placement titles never reach detectProgrammeType
  // because classifyPosting excludes them first.)
  it("honours the precedence SPRING_WEEK > OFF_CYCLE > SUMMER", () => {
    // Spring beats off-cycle and summer.
    expect(
      detectProgrammeType({
        title: "Spring Off-Cycle Insight Week",
        location: "London",
      }),
    ).toBe("SPRING_WEEK");
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
      // Cycle 3e: "Markets Immersion Programme" was REMOVED from this list — a
      // BARE branded word ("immersion") is no longer a SPRING_WEEK on its own
      // (it encoded the precision bug; taxonomy requires a year-1/insight
      // co-token). It now classifies SUMMER and is asserted in the
      // "generic Spring-Week signals require an insight/year-1 co-token" block.
      // "Women's Horizons Programme" stays here: "women" IS a diversity-insight
      // co-token, so the branded word "horizons" legitimately fires SPRING_WEEK.
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

  // Research edge case 5 / bucket-4 note: bare "placement" is OVERLOADED in the
  // UK — require a year/sandwich/industrial qualifier. A 6-week summer placement
  // is a summer internship (NOT excluded as industrial placement), and a "Trading
  // Floor Placement Intern" stays a SUMMER_INTERNSHIP. These keep the bare-
  // "placement"-needs-a-qualifier rule that protects against over-excluding.
  it("does NOT exclude a bare 'placement' as industrial-placement (keeps SUMMER)", () => {
    expect(
      detectProgrammeType({ title: "Summer Placement (6 weeks) — Markets", location: "London" }),
    ).toBe("SUMMER_INTERNSHIP");
    expect(
      detectProgrammeType({ title: "Trading Floor Placement Intern", location: "London" }),
    ).toBe("SUMMER_INTERNSHIP");
    // And classifyPosting does NOT industrial-placement-exclude a bare-placement
    // role: a "Trading Floor Placement Intern" (carries an `intern` token, so it
    // passes the not-internship gate) is included as a SUMMER_INTERNSHIP.
    const a = classifyPosting(
      { title: "Trading Floor Placement Intern", location: "London" },
      "MARKETS",
    );
    expect(a.include).toBe(true);
    if (a.include) expect(a.programmeType).toBe("SUMMER_INTERNSHIP");
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

  // Cycle 3e (hardened not-internship): "upcoming graduates" is a graduate
  // signal, but the existing /\bgraduate\b/ misses the PLURAL "graduates", so a
  // "Programme for Upcoming Graduates" used to slip past the not-internship gate
  // (no "academy" token either). Add /\bupcoming graduates?\b/ so it is excluded.
  it("excludes a 'Programme for Upcoming Graduates' (plural, no academy token)", () => {
    expect(
      classifyPosting(
        { title: "Quant Programme for Upcoming Graduates", location: "London" },
        "QUANT",
      ),
    ).toEqual({ include: false, reason: "not-internship" });
    // Held-out singular variant.
    expect(
      classifyPosting(
        { title: "Markets Programme for an Upcoming Graduate", location: "London" },
        "MARKETS",
      ),
    ).toEqual({ include: false, reason: "not-internship" });
  });

  // Apprenticeships (research edge case 6, taxonomy §"Recommended EXCLUDE
  // signals"): UK degree / school-leaver apprenticeships are full-time,
  // multi-year ROUTES, not internships — the-trackr keeps them out of its
  // internship tabs. A BARE apprenticeship (no industrial-placement signal) is
  // EXCLUDED with reason "apprenticeship".
  it("excludes a bare degree apprenticeship (no placement signal)", () => {
    const v = classifyPosting(
      { title: "Degree Apprenticeship — Finance", location: "London" },
      "IB",
    );
    expect(v.include).toBe(false);
    if (!v.include) expect(v.reason).toBe("apprenticeship");
  });

  it("excludes a school-leaver technology degree apprenticeship", () => {
    const v = classifyPosting(
      { title: "Technology Degree Apprenticeship (school leaver)", location: "London" },
      "QUANT",
    );
    expect(v.include).toBe(false);
    // School-leaver hits pre-university OR apprenticeship — either exclusion is
    // fine per spec (both keep it off the board).
    if (!v.include)
      expect(["apprenticeship", "pre-university"]).toContain(v.reason);
  });
});

// Industrial-placement EXCLUSION (ADR-006). Industrial placements ("industry")
// are no longer a tracked bucket — they are EXCLUDED. The exclusion is evaluated
// BEFORE programme-type assignment (and before the apprenticeship exclusion, so
// "Year in Industry Apprentice" is excluded as industrial-placement). The bare-
// "placement"-needs-a-qualifier rule is preserved (covered above) so a 6-week
// summer placement is NOT swept up.
describe("classifyPosting — industrial-placement exclusion (ADR-006)", () => {
  it("excludes placement-year / year-in-industry / sandwich / industrial-placement titles", () => {
    for (const title of [
      "Industrial Placement, Finance",
      "Placement Year Analyst",
      "Year in Industry — Risk",
      "Sandwich Placement, Finance",
      "Sandwich Year Analyst",
      "Sandwich Course — Markets",
      "Industrial Year Trainee",
      "12-month Industrial Placement Year Programme",
      "12-month Placement — Risk",
    ]) {
      const v = classifyPosting({ title, location: "London" }, "IB");
      expect(v.include).toBe(false);
      if (!v.include) expect(v.reason).toBe("industrial-placement");
    }
  });

  // Held-out: a genuine UK "Industrial Placement" finance role → excluded
  // (novel title not used elsewhere; carries a real role family + UK location).
  it("excludes a genuine UK industrial-placement finance role (held-out)", () => {
    const v = classifyPosting(
      {
        title: "Investment Banking Industrial Placement — 12 Months",
        location: "London, United Kingdom",
      },
      "IB",
    );
    expect(v).toEqual({ include: false, reason: "industrial-placement" });
  });

  // "Year in Industry Apprentice" fires the industrial-placement signal, so it is
  // EXCLUDED as industrial-placement (industry is dropped "for now", ADR-006).
  // The exclusion runs ahead of the apprenticeship guard.
  it("excludes 'Year in Industry Apprentice' as industrial-placement", () => {
    const v = classifyPosting(
      { title: "Year in Industry Apprentice", location: "London" },
      "IB",
    );
    expect(v).toEqual({ include: false, reason: "industrial-placement" });
  });

  // The industrial-placement exclusion fires BEFORE programme-type assignment:
  // a title that ALSO carries a spring-insight signal is still excluded, not
  // tagged SPRING_WEEK.
  it("excludes even when a spring/insight signal co-occurs (exclusion runs first)", () => {
    const v = classifyPosting(
      { title: "Spring Insight Week & Industrial Placement Year", location: "London" },
      "IB",
    );
    expect(v).toEqual({ include: false, reason: "industrial-placement" });
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

  // NOTE (ADR-003 retained, ADR-006 narrowed): the classifier TAGS programme
  // season instead of discarding Spring Weeks / off-cycle (the retained bug fix).
  // Industrial placements are no longer a tracked bucket — they are EXCLUDED
  // (asserted in the industrial-placement-exclusion block). Region is gone
  // (ADR-005, UK-only) so these no longer carry a `region` field.
  it("classifies spring weeks and off-cycle instead of discarding", () => {
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

  // Cycle 3e (weak early-careers recall): a "campus" title that ALSO carries an
  // intern/internship co-token reads as an early-careers internship, so a
  // "Campus … (Intern)" style title passes the not-internship gate.
  it("admits a 'Campus … Intern' early-careers title (campus + intern co-token)", () => {
    const v = classifyPosting(
      { title: "Campus Analyst Internship", location: "London" },
      "MARKETS",
    );
    expect(v.include).toBe(true);
    if (v.include) expect(v.programmeType).toBe("SUMMER_INTERNSHIP");
    // Parenthetical "(Intern)" variant also qualifies (campus + intern token).
    expect(
      classifyPosting(
        { title: "Campus Programme — Markets (Intern)", location: "London" },
        "MARKETS",
      ).include,
    ).toBe(true);
  });

  // Guard: BARE "campus" with NO intern token must NOT pass the gate — campus is
  // only a WEAK signal that needs an intern co-token, so a "Campus Hire, M&A"
  // (full-time-style) stays excluded as not-internship.
  it("does NOT admit a bare 'campus' title with no intern token", () => {
    expect(
      classifyPosting({ title: "Campus Hire — M&A", location: "London" }, "IB"),
    ).toEqual({ include: false, reason: "not-internship" });
  });
});
