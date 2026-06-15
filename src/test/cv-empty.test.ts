// src/test/cv-empty.test.ts
import { describe, it, expect } from "vitest";
import { isCvEmpty, EMPTY_CV, cvDataSchema } from "@/lib/cv";

describe("isCvEmpty", () => {
  it("is true for the empty CV", () => {
    expect(isCvEmpty(EMPTY_CV)).toBe(true);
  });

  it("is true when only a fullName is present (stub row)", () => {
    expect(isCvEmpty(cvDataSchema.parse({ fullName: "Eric Mai" }))).toBe(true);
  });

  it("is false once there is education", () => {
    const cv = cvDataSchema.parse({
      education: [{ institution: "Cambridge", qualification: "Economics BA" }],
    });
    expect(isCvEmpty(cv)).toBe(false);
  });

  it("is false once there is a summary", () => {
    expect(isCvEmpty(cvDataSchema.parse({ summary: "Aspiring analyst." }))).toBe(false);
  });
});
