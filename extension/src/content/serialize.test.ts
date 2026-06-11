import { describe, it, expect } from "vitest";
import { clampFields, serializeForm } from "./serialize";
import type { FieldSchema } from "../shared/types";

const base: FieldSchema = { id: "f0", label: "Email", type: "email", required: false };

describe("clampFields", () => {
  it("truncates labels to 400 chars", () => {
    const [f] = clampFields([{ ...base, label: "x".repeat(900) }]);
    expect(f.label.length).toBe(400);
  });

  it("caps options to 80 and 200 chars each", () => {
    const options = Array.from({ length: 120 }, () => "o".repeat(300));
    const [f] = clampFields([{ ...base, type: "select", options }]);
    expect(f.options?.length).toBe(80);
    expect(f.options?.[0].length).toBe(200);
  });

  it("limits the batch to 200 fields", () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ ...base, id: `f${i}` }));
    expect(clampFields(many).length).toBe(200);
  });

  it("clamps an oversized charLimit", () => {
    const [f] = clampFields([{ ...base, type: "textarea", charLimit: 99999 }]);
    expect(f.charLimit).toBe(20000);
  });
});

describe("serializeForm + ARIA", () => {
  it("serializes native inputs and ARIA radiogroups together", () => {
    document.body.innerHTML = `
      <input id="e" type="email"/><label for="e">Email</label>
      <div role="radiogroup" aria-label="Sponsorship needed?">
        <div role="radio" aria-label="Yes"></div>
        <div role="radio" aria-label="No"></div>
      </div>`;
    const { fields, elements } = serializeForm(document.body);
    const radio = fields.find((f) => f.label === "Sponsorship needed?");
    expect(radio?.type).toBe("radio");
    expect(radio?.options).toEqual(["Yes", "No"]);
    expect(elements.size).toBe(fields.length);
  });
});
