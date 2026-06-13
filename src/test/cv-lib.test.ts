// src/test/cv-lib.test.ts
import { describe, it, expect } from "vitest";
import {
  cvDataSchema,
  cvFormInputSchema,
  formInputToCvData,
  cvToPlainText,
  EMPTY_CV,
} from "@/lib/cv";

describe("cvDataSchema", () => {
  it("fills defaults from an empty object", () => {
    const cv = cvDataSchema.parse({});
    expect(cv.fullName).toBe("");
    expect(cv.education).toEqual([]);
    expect(cv.contact).toEqual({});
  });

  it("accepts a template-shaped CV", () => {
    const cv = cvDataSchema.parse({
      fullName: "Eric Mai",
      contact: { email: "x@cam.ac.uk", phone: "+44 7877", linkedin: "linkedin.com/in/eric" },
      education: [{ institution: "Cambridge, Trinity", qualification: "Economics BA", dates: "Sep 2025 – Jun 2028", grade: "Predicted First", bullets: ["Microeconomics"] }],
      projects: [{ name: "Oxbridge AI Hackathon", result: "1st Place", bullets: ["won"], skills: ["Python"] }],
      skills: [{ label: "Technical", items: ["Python", "SQL"] }],
    });
    expect(cv.education[0].grade).toBe("Predicted First");
    expect(cv.projects[0].result).toBe("1st Place");
  });

  it("rejects genuinely invalid input", () => {
    // number for fullName (string required)
    expect(() => cvDataSchema.parse({ fullName: 42 })).toThrow();
    // array where fullName string is required
    expect(() => cvDataSchema.parse({ fullName: ["not", "a", "string"] })).toThrow();
    // non-array for education (array required)
    expect(() => cvDataSchema.parse({ education: "not-an-array" })).toThrow();
  });
});

describe("formInputToCvData", () => {
  it("composes a date range from start/end years and splits bullets/skills", () => {
    const formInput = cvFormInputSchema.parse({
      education: [{ institution: "Cambridge", qualification: "Economics BA", startYear: "2025", endYear: "2028", grade: "First", modules: "Micro\nMacro" }],
      accomplishments: [{ title: "BMO Distinction" }],
      projects: [{ name: "QuantiHack", skills: "Python, FastAPI", description: "Built a tool\nDid analysis" }],
    });
    const cv = formInputToCvData(formInput, { fullName: "Eric Mai", email: "x@cam.ac.uk" });
    expect(cv.fullName).toBe("Eric Mai");
    expect(cv.contact.email).toBe("x@cam.ac.uk");
    expect(cv.education[0].dates).toBe("2025 – 2028");
    expect(cv.education[0].bullets).toEqual(["Micro", "Macro"]);
    expect(cv.projects[0].skills).toEqual(["Python", "FastAPI"]);
    expect(cv.projects[0].bullets).toEqual(["Built a tool", "Did analysis"]);
    expect(cv.accomplishments[0].title).toBe("BMO Distinction");
  });

  it("handles a single year and missing optional fields", () => {
    const cv = formInputToCvData(
      cvFormInputSchema.parse({ education: [{ institution: "KCLMS", qualification: "A Levels", startYear: "2023" }] }),
      { fullName: "Eric Mai" },
    );
    expect(cv.education[0].dates).toBe("2023");
    expect(cv.education[0].bullets).toEqual([]);
  });

  it("empty form input produces a valid EMPTY_CV-shaped object", () => {
    const cv = formInputToCvData(cvFormInputSchema.parse({}), { fullName: "" });
    expect(cv.education).toEqual([]);
    expect(cv.accomplishments).toEqual([]);
    expect(cv.projects).toEqual([]);
  });

  it("prefills contact fields from prefill object", () => {
    const cv = formInputToCvData(cvFormInputSchema.parse({}), {
      fullName: "Jane Doe",
      phone: "+44 7700",
      location: "London",
      linkedin: "linkedin.com/in/jane",
      github: "github.com/jane",
      website: "janedoe.com",
    });
    expect(cv.contact.phone).toBe("+44 7700");
    expect(cv.contact.location).toBe("London");
    expect(cv.contact.linkedin).toBe("linkedin.com/in/jane");
    expect(cv.contact.github).toBe("github.com/jane");
    expect(cv.contact.website).toBe("janedoe.com");
  });
});

describe("cvToPlainText", () => {
  it("produces text containing every populated section", () => {
    const cv = cvDataSchema.parse({
      fullName: "Eric Mai",
      education: [{ institution: "Cambridge", qualification: "Economics BA", grade: "First" }],
      experience: [{ org: "Millennium", role: "Summer Analyst", bullets: ["Selected"] }],
      projects: [{ name: "Hackathon", bullets: ["Won"] }],
      skills: [{ label: "Technical", items: ["Python"] }],
    });
    const text = cvToPlainText(cv);
    expect(text).toContain("Eric Mai");
    expect(text).toContain("Cambridge");
    expect(text).toContain("Millennium");
    expect(text).toContain("Python");
  });

  it("EMPTY_CV serialises without throwing", () => {
    expect(() => cvToPlainText(EMPTY_CV)).not.toThrow();
  });

  it("includes accomplishments as honours & awards section", () => {
    const cv = cvDataSchema.parse({
      fullName: "Test",
      accomplishments: [{ title: "BMO Gold Medal", date: "2025" }],
    });
    const text = cvToPlainText(cv);
    expect(text).toContain("BMO Gold Medal");
    expect(text).toContain("2025");
  });
});
