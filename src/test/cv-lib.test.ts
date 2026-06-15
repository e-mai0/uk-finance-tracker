// src/test/cv-lib.test.ts
import { describe, it, expect } from "vitest";
import {
  cvDataSchema,
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
