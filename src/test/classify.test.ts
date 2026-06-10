import { describe, expect, it } from "vitest";
import {
  classifyPosting,
  isUkLocation,
  inferRoleFamily,
  roleFamilyFromSector,
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

describe("classifyPosting", () => {
  it("includes a classic summer analyst posting", () => {
    const v = classifyPosting({
      title: "Investment Banking Summer Analyst 2027",
      location: "London",
    });
    expect(v).toEqual({ include: true, roleFamily: "IB", via: "keyword" });
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

  it("excludes spring weeks, insight days and off-cycle internships", () => {
    expect(
      classifyPosting({ title: "Spring Insight Week", location: "London" }),
    ).toEqual({ include: false, reason: "wrong-season" });
    expect(
      classifyPosting({ title: "Off-cycle Intern, Markets", location: "London" }),
    ).toEqual({ include: false, reason: "wrong-season" });
  });

  it("excludes non-UK postings", () => {
    expect(
      classifyPosting({ title: "Summer Analyst, M&A", location: "New York" }),
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
    ).toEqual({ include: true, roleFamily: "HEDGE_FUND", via: "fallback" });
  });

  it("excludes generic intern titles when nothing identifies the function", () => {
    expect(
      classifyPosting({ title: "Summer Internship 2027", location: "London" }),
    ).toEqual({ include: false, reason: "not-finance" });
  });
});
