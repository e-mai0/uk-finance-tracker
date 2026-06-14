// src/test/cv-docx.test.ts
import { describe, it, expect } from "vitest";
import { renderCvDocx } from "@/server/cv/docx";
import { cvDataSchema, slugifyName } from "@/lib/cv";

describe("renderCvDocx", () => {
  it("returns a .docx buffer (zip → starts with PK)", async () => {
    const cv = cvDataSchema.parse({
      fullName: "Eric Mai",
      contact: { email: "x@cam.ac.uk", phone: "+44 7877" },
      education: [{ institution: "Cambridge, Trinity", qualification: "Economics BA", dates: "Sep 2025 – Jun 2028", grade: "Predicted First", bullets: ["Microeconomics", "Macroeconomics"] }],
      experience: [{ org: "Millennium", role: "Summer Analyst", dates: "Jun 2027", bullets: ["Selected for the programme"] }],
      projects: [{ name: "Oxbridge AI Hackathon", result: "1st Place", bullets: ["Won"], skills: ["Python"] }],
      skills: [{ label: "Technical", items: ["Python", "SQL"] }],
      interests: ["Volleyball"],
    });
    const buf = await renderCvDocx(cv);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("handles an empty CV without throwing", async () => {
    const buf = await renderCvDocx(cvDataSchema.parse({ fullName: "Nobody" }));
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});

describe("slugifyName", () => {
  it("replaces spaces with underscores", () => {
    expect(slugifyName("Eric Mai")).toBe("Eric_Mai");
  });

  it("strips special characters", () => {
    expect(slugifyName("O'Brien-Smith")).toBe("OBrienSmith");
  });

  it("collapses multiple spaces", () => {
    expect(slugifyName("  Jane   Doe  ")).toBe("Jane_Doe");
  });

  it("returns CV for an empty or whitespace-only string", () => {
    expect(slugifyName("")).toBe("CV");
    expect(slugifyName("   ")).toBe("CV");
  });
});
