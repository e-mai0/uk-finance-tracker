import { describe, expect, it } from "vitest";
import {
  validateActions,
  filterUnresolved,
  type AgentField,
} from "@/server/agent/validate";

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

  it("caps reason length at 300", () => {
    const out = validateActions(
      [{ fieldId: "f0", value: "ok", reason: "r".repeat(500), confidence: "medium" }],
      FIELDS,
    );
    expect(out[0]!.reason).toHaveLength(300);
  });

  it("drops actions targeting fields with disallowed kinds", () => {
    const fields: AgentField[] = [
      { fieldId: "up", type: "file", options: undefined },
      { fieldId: "go", type: "submit", options: undefined },
    ];
    const out = validateActions(
      [
        { fieldId: "up", value: "cv.pdf", reason: "", confidence: "high" },
        { fieldId: "go", value: "true", reason: "", confidence: "high" },
      ],
      fields,
    );
    expect(out).toEqual([]);
  });

  it("drops all values for a radio field with an empty options array", () => {
    const fields: AgentField[] = [
      { fieldId: "r0", type: "radio", options: [] },
    ];
    const out = validateActions(
      [
        { fieldId: "r0", value: "yes", reason: "", confidence: "high" },
        { fieldId: "r0", value: "", reason: "", confidence: "low" },
      ],
      fields,
    );
    expect(out).toEqual([]);
  });

  it("keeps later fields' first valid actions despite a flood of duplicates for one field", () => {
    const flood = Array.from({ length: 10 }, (_, i) => ({
      fieldId: "f0",
      value: `dupe-${i}`,
      reason: "",
      confidence: "high" as const,
    }));
    const out = validateActions(
      [
        ...flood,
        { fieldId: "f1", value: "Three months", reason: "", confidence: "high" },
      ],
      FIELDS,
    );
    expect(out).toEqual([
      { fieldId: "f0", value: "dupe-0", reason: "", confidence: "high" },
      { fieldId: "f1", value: "Three months", reason: "", confidence: "high" },
    ]);
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

describe("filterUnresolved", () => {
  it("drops unresolved items for fieldIds the page did not submit", () => {
    const out = filterUnresolved(
      [
        { fieldId: "f0", question: "What is your notice period?" },
        { fieldId: "ghost", question: "Invented field?" },
      ],
      FIELDS,
    );
    expect(out).toEqual([
      { fieldId: "f0", question: "What is your notice period?" },
    ]);
  });

  it("caps unresolved items at 20", () => {
    const fields: AgentField[] = Array.from({ length: 30 }, (_, i) => ({
      fieldId: `u${i}`,
      type: "text",
      options: undefined,
    }));
    const unresolved = fields.map((f) => ({
      fieldId: f.fieldId,
      question: `Question for ${f.fieldId}?`,
    }));
    const out = filterUnresolved(unresolved, fields);
    expect(out).toHaveLength(20);
    expect(out[0]!.fieldId).toBe("u0");
  });

  it("caps question length at 300", () => {
    const out = filterUnresolved(
      [{ fieldId: "f0", question: "q".repeat(500) }],
      FIELDS,
    );
    expect(out[0]!.question).toHaveLength(300);
  });

  it("returns empty for empty input", () => {
    expect(filterUnresolved([], FIELDS)).toEqual([]);
  });
});
