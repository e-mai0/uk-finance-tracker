import { describe, it, expect } from "vitest";
import { buildDeterministicPlan } from "../lib/form-plan";
import type { FieldSchema } from "../lib/validation";

const f = (p: Partial<FieldSchema> & { id: string }): FieldSchema => ({
  label: "",
  type: "text",
  required: false,
  ...p,
});

const values = {
  email: "ada@example.com",
  firstName: "Ada",
  university: "Oxford",
};

describe("buildDeterministicPlan", () => {
  it("fills a known field that has a value", () => {
    const plan = buildDeterministicPlan([f({ id: "f0", label: "Email", type: "email" })], values);
    expect(plan[0]).toMatchObject({
      fieldId: "f0",
      action: "fill",
      value: "ada@example.com",
      profileKey: "email",
    });
    expect(plan[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("asks for a known key that has no stored value", () => {
    const plan = buildDeterministicPlan(
      [f({ id: "f0", label: "Phone number", type: "tel" })],
      values,
    );
    expect(plan[0].action).toBe("ask");
    expect(plan[0].profileKey).toBe("phone");
    expect(plan[0].question).toMatch(/phone/i);
  });

  it("drafts an essay-style textarea", () => {
    const plan = buildDeterministicPlan(
      [f({ id: "f0", label: "Why do you want to work here?", type: "textarea" })],
      values,
    );
    expect(plan[0].action).toBe("draft");
  });

  it("asks for an unrecognized factual field", () => {
    const plan = buildDeterministicPlan(
      [f({ id: "f0", label: "Expected salary (GBP)", type: "number" })],
      values,
    );
    expect(plan[0].action).toBe("ask");
    expect(plan[0].profileKey).toBeUndefined();
  });

  it("preserves field order and ids", () => {
    const plan = buildDeterministicPlan(
      [f({ id: "a", label: "Email", type: "email" }), f({ id: "b", label: "Salary", type: "number" })],
      values,
    );
    expect(plan.map((p) => p.fieldId)).toEqual(["a", "b"]);
  });
});

import { buildMappingPrompt, mergeMappings } from "../lib/form-plan";

describe("buildMappingPrompt", () => {
  it("lists unresolved fields and the available value keys", () => {
    const prompt = buildMappingPrompt(
      [f({ id: "f0", label: "Where are you based?", type: "text" })],
      { city: "London", country: "United Kingdom" },
    );
    expect(prompt).toContain("f0");
    expect(prompt).toContain("Where are you based?");
    expect(prompt).toContain("city");
    expect(prompt).toContain("country");
  });
});

describe("mergeMappings", () => {
  const base = buildDeterministicPlan(
    [f({ id: "f0", label: "Where are you based?", type: "text" })],
    { city: "London" },
  );

  it("upgrades an unresolved ask to a fill when the LLM maps it", () => {
    const merged = mergeMappings(base, { city: "London" }, [
      { fieldId: "f0", profileKey: "city", confidence: 0.8 },
    ]);
    expect(merged[0]).toMatchObject({ action: "fill", value: "London", profileKey: "city" });
  });

  it("ignores a mapping to a key with no value", () => {
    const merged = mergeMappings(base, { city: "London" }, [
      { fieldId: "f0", profileKey: "phone", confidence: 0.8 },
    ]);
    expect(merged[0].action).toBe("ask");
  });

  it("ignores low-confidence mappings", () => {
    const merged = mergeMappings(base, { city: "London" }, [
      { fieldId: "f0", profileKey: "city", confidence: 0.3 },
    ]);
    expect(merged[0].action).toBe("ask");
  });

  it("leaves fields the LLM did not mention untouched", () => {
    const merged = mergeMappings(base, { city: "London" }, []);
    expect(merged[0].action).toBe("ask");
  });
});
