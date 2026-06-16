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

describe("serializeForm — shared-container labels (no duplicate questions)", () => {
  // Regression: two essay textareas sharing one fieldset/legend were each given
  // the legend as their label, so they produced identical drafted answers.
  it("gives two textareas in one fieldset distinct labels", () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Tell us about your motivation</legend>
        <textarea name="motivation_a"></textarea>
        <textarea name="motivation_b"></textarea>
      </fieldset>`;
    const labels = serializeForm(document.body)
      .fields.filter((f) => f.type === "textarea")
      .map((f) => f.label);
    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2); // not both "Tell us about your motivation"
  });

  it("still uses the legend when the container has a single control", () => {
    document.body.innerHTML = `
      <fieldset><legend>Why this firm?</legend>
        <textarea name="why"></textarea>
      </fieldset>`;
    expect(serializeForm(document.body).fields[0].label).toBe("Why this firm?");
  });

  it("keeps the legend for an unlabeled radio group (radios count as one control)", () => {
    document.body.innerHTML = `
      <fieldset><legend>Eligible to work in the UK?</legend>
        <input type="radio" name="rtw" value="yes"/>
        <input type="radio" name="rtw" value="no"/>
      </fieldset>`;
    const rtw = serializeForm(document.body).fields.find((f) => f.type === "radio");
    expect(rtw?.label).toBe("Eligible to work in the UK?");
  });
});
