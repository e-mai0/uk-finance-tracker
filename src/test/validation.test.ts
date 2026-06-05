import { describe, it, expect } from "vitest";
import {
  signupSchema,
  educationSchema,
  onboardingSchema,
} from "../lib/validation";

describe("signupSchema", () => {
  it("accepts a valid signup and normalizes email", () => {
    const r = signupSchema.safeParse({
      name: "Alex Morgan",
      email: "ALEX@Example.com ",
      password: "supersecret",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("alex@example.com");
  });

  it("rejects short passwords", () => {
    const r = signupSchema.safeParse({
      name: "Alex Morgan",
      email: "alex@example.com",
      password: "short",
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid emails", () => {
    const r = signupSchema.safeParse({
      name: "Alex Morgan",
      email: "not-an-email",
      password: "supersecret",
    });
    expect(r.success).toBe(false);
  });
});

describe("educationSchema", () => {
  it("requires a sane graduation year", () => {
    const ok = educationSchema.safeParse({
      university: "University of Cambridge",
      degreeSubject: "Economics",
      degreeType: "BA",
      graduationYear: 2028,
      currentYear: 2,
    });
    expect(ok.success).toBe(true);

    const bad = educationSchema.safeParse({
      university: "University of Cambridge",
      degreeSubject: "Economics",
      degreeType: "BA",
      graduationYear: 1990,
      currentYear: 2,
    });
    expect(bad.success).toBe(false);
  });
});

describe("onboardingSchema", () => {
  const valid = {
    university: "University of Cambridge",
    degreeSubject: "Economics",
    degreeType: "BA",
    graduationYear: 2028,
    currentYear: 2,
    targetRoleFamilies: ["IB"],
    skills: ["excel"],
    workAuth: "UK_CITIZEN",
    preferredLocations: ["London"],
    openToAnywhereUk: false,
    targetEmployers: [],
  };

  it("accepts a complete payload", () => {
    expect(onboardingSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a location unless open to anywhere in the UK", () => {
    const noLocation = { ...valid, preferredLocations: [], openToAnywhereUk: false };
    expect(onboardingSchema.safeParse(noLocation).success).toBe(false);

    const anywhere = { ...valid, preferredLocations: [], openToAnywhereUk: true };
    expect(onboardingSchema.safeParse(anywhere).success).toBe(true);
  });

  it("requires at least one target role family", () => {
    const noFamily = { ...valid, targetRoleFamilies: [] };
    expect(onboardingSchema.safeParse(noFamily).success).toBe(false);
  });
});
