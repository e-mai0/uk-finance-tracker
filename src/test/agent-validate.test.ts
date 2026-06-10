import { describe, expect, it } from "vitest";
import { validateActions, type AgentField } from "@/server/agent/validate";

const FIELDS: AgentField[] = [
  { fieldId: "f0", type: "text", options: undefined },
  { fieldId: "f1", type: "select", options: ["One month", "Three months"] },
  { fieldId: "f2", type: "checkbox", options: undefined },
];

describe("validateActions", () => {
  it("drops actions for unknown fieldIds", () => {
    const out = validateActions(
      [{ fieldId: "nope", value: "x", reason: "", confidence: "high" }],
      FIELDS,
    );
    expect(out).toEqual([]);
  });

  it("canonicalises select values case-insensitively and drops non-options", () => {
    const out = validateActions(
      [
        { fieldId: "f1", value: "one month", reason: "", confidence: "high" },
        { fieldId: "f1", value: "Two weeks", reason: "", confidence: "high" },
      ],
      FIELDS,
    );
    expect(out).toEqual([
      { fieldId: "f1", value: "One month", reason: "", confidence: "high" },
    ]);
  });

  it("keeps only the first action per field", () => {
    const out = validateActions(
      [
        { fieldId: "f0", value: "a", reason: "", confidence: "high" },
        { fieldId: "f0", value: "b", reason: "", confidence: "low" },
      ],
      FIELDS,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.value).toBe("a");
  });

  it("caps value length at 2000", () => {
    const out = validateActions(
      [{ fieldId: "f0", value: "x".repeat(3000), reason: "", confidence: "medium" }],
      FIELDS,
    );
    expect(out[0]!.value).toHaveLength(2000);
  });

  it("restricts checkbox values to true/false", () => {
    const ok = validateActions(
      [{ fieldId: "f2", value: "true", reason: "", confidence: "high" }],
      FIELDS,
    );
    const bad = validateActions(
      [{ fieldId: "f2", value: "maybe", reason: "", confidence: "high" }],
      FIELDS,
    );
    expect(ok).toHaveLength(1);
    expect(bad).toEqual([]);
  });
});
