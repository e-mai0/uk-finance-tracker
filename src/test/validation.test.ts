import { describe, it, expect } from "vitest";
import {
  signupSchema,
  educationSchema,
  essentialsSchema,
  questionnaireSchema,
  extPlanRequestSchema,
  sanitizePlanBody,
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

describe("essentialsSchema", () => {
  const valid = {
    university: "University of Cambridge",
    degreeSubject: "Economics",
    degreeType: "BA",
    graduationYear: 2028,
    currentYear: 2,
    targetRoleFamilies: ["IB"],
  };

  it("accepts a complete payload", () => {
    expect(essentialsSchema.safeParse(valid).success).toBe(true);
  });

  it("requires at least one target role family", () => {
    expect(
      essentialsSchema.safeParse({ ...valid, targetRoleFamilies: [] }).success,
    ).toBe(false);
  });

  it("rejects a missing university", () => {
    expect(
      essentialsSchema.safeParse({ ...valid, university: "" }).success,
    ).toBe(false);
  });
});

describe("questionnaireSchema", () => {
  it("accepts an entirely empty payload with defaults", () => {
    const r = questionnaireSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.skills).toEqual([]);
      expect(r.data.openToAnywhereUk).toBe(true);
      expect(r.data.workAuth).toBeUndefined();
    }
  });

  it("accepts a full payload", () => {
    const r = questionnaireSchema.safeParse({
      workAuth: "UK_CITIZEN",
      gradeInfo: { aLevels: "A*A*A", gcseSummary: "", gpaOrEquivalent: "First" },
      skills: ["excel"],
      preferredLocations: ["London"],
      openToAnywhereUk: false,
      targetEmployers: ["Goldman Sachs"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid work auth value", () => {
    expect(questionnaireSchema.safeParse({ workAuth: "MARTIAN" }).success).toBe(false);
  });

  it("accepts an explicit null workAuth (clear)", () => {
    const r = questionnaireSchema.safeParse({ workAuth: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.workAuth).toBeNull();
  });
});

describe("extPlanRequestSchema", () => {
  const validField = {
    id: "f0",
    label: "Email",
    type: "email",
    required: true,
  };

  it("accepts a minimal valid request", () => {
    const r = extPlanRequestSchema.safeParse({ fields: [validField] });
    expect(r.success).toBe(true);
  });

  it("defaults required to false and trims label", () => {
    const r = extPlanRequestSchema.parse({
      fields: [{ id: "f1", label: "  Full name  ", type: "text" }],
    });
    expect(r.fields[0].required).toBe(false);
    expect(r.fields[0].label).toBe("Full name");
  });

  it("rejects an empty fields array", () => {
    const r = extPlanRequestSchema.safeParse({ fields: [] });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown field type", () => {
    const r = extPlanRequestSchema.safeParse({
      fields: [{ id: "f0", label: "x", type: "color" }],
    });
    expect(r.success).toBe(false);
  });

  it("caps fields at 200 to bound payload size", () => {
    const many = Array.from({ length: 201 }, (_, i) => ({
      id: `f${i}`,
      label: "x",
      type: "text",
    }));
    expect(extPlanRequestSchema.safeParse({ fields: many }).success).toBe(false);
  });
});

describe("sanitizePlanBody", () => {
  const field = (over: Record<string, unknown> = {}) => ({
    id: "f0", label: "Email", type: "email", required: false, ...over,
  });

  it("truncates an over-long label so the schema accepts it", () => {
    const clean = sanitizePlanBody({ fields: [field({ label: "x".repeat(900) })] });
    const parsed = extPlanRequestSchema.safeParse(clean);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.fields[0].label.length).toBe(400);
  });

  it("drops a field with an unknown type instead of failing the batch", () => {
    const clean = sanitizePlanBody({
      fields: [field(), field({ id: "f1", type: "bogus" })],
    }) as { fields: unknown[] };
    expect(clean.fields.length).toBe(1);
  });

  it("caps the batch at 200 fields", () => {
    const many = Array.from({ length: 250 }, (_, i) => field({ id: `f${i}` }));
    const clean = sanitizePlanBody({ fields: many }) as { fields: unknown[] };
    expect(clean.fields.length).toBe(200);
  });

  it("caps options to 80 entries and 200 chars each", () => {
    const opts = Array.from({ length: 120 }, () => "o".repeat(300));
    const clean = sanitizePlanBody({
      fields: [field({ type: "select", options: opts })],
    }) as { fields: { options: string[] }[] };
    expect(clean.fields[0].options.length).toBe(80);
    expect(clean.fields[0].options[0].length).toBe(200);
  });

  it("produces a body the strict schema fully accepts", () => {
    const clean = sanitizePlanBody({
      fields: [field({ label: "y".repeat(900), charLimit: 99999 })],
      employer: "z".repeat(500),
    });
    expect(extPlanRequestSchema.safeParse(clean).success).toBe(true);
  });

  it("drops a field whose id is only whitespace", () => {
    const clean = sanitizePlanBody({
      fields: [field({ id: "   " }), field({ id: "ok" })],
    }) as { fields: { id: string }[] };
    expect(clean.fields.length).toBe(1);
    expect(clean.fields[0].id).toBe("ok");
    expect(extPlanRequestSchema.safeParse(clean).success).toBe(true);
  });

  it("coerces non-string employer/role/url to undefined so the schema accepts them", () => {
    const clean = sanitizePlanBody({
      fields: [field()],
      employer: 42,
      role: ["x"],
      url: { nope: true },
    });
    expect(extPlanRequestSchema.safeParse(clean).success).toBe(true);
  });
});
