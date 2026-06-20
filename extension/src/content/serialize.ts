import { getLabelText, collectFields, esc, type FillableEl } from "./field-map";
import { collectAriaControls } from "./aria-controls";
import type { FillTarget } from "./autofill";
import type { FieldSchema, FieldType } from "../shared/types";
import { LIMITS } from "../shared/limits";

export interface SerializedForm {
  fields: FieldSchema[];
  elements: Map<string, FillTarget>;
}

function fieldType(el: FillableEl): FieldType {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return "select";
  const t = (el.type || "text").toLowerCase();
  if (t === "email") return "email";
  if (t === "tel") return "tel";
  if (t === "url") return "url";
  if (t === "number") return "number";
  if (t === "date") return "date";
  if (t === "radio") return "radio";
  if (t === "checkbox") return "checkbox";
  return "text";
}

function optionsFor(el: FillableEl): string[] | undefined {
  if (el instanceof HTMLSelectElement) {
    const opts = Array.from(el.options).map((o) => o.text.trim()).filter(Boolean);
    return opts.length ? opts.slice(0, 80) : undefined;
  }
  return undefined;
}

/** Walk a form container into a compact FieldSchema[] plus an id→element map. */
export function serializeForm(root: ParentNode): SerializedForm {
  const elements = new Map<string, FillTarget>();
  const fields: FieldSchema[] = [];
  const seenRadioGroups = new Set<string>();
  let i = 0;

  for (const el of collectFields(root)) {
    // Collapse radio groups to one schema field, keyed on the first radio.
    if (el instanceof HTMLInputElement && el.type === "radio") {
      if (!el.name || seenRadioGroups.has(el.name)) continue;
      seenRadioGroups.add(el.name);
    }

    const id = `f${i++}`;
    el.setAttribute("data-cyclops-fid", id);
    elements.set(id, el);

    const type = fieldType(el);
    const options =
      type === "radio" && el instanceof HTMLInputElement && el.name
        ? radioOptions(root, el.name)
        : optionsFor(el);

    fields.push({
      id,
      label: getLabelText(el),
      type,
      options,
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
      charLimit:
        el instanceof HTMLTextAreaElement && el.maxLength > 0 ? el.maxLength : undefined,
    });
  }

  for (const control of collectAriaControls(root)) {
    const id = `f${i++}`;
    elements.set(id, control);
    fields.push({
      id,
      label: control.label,
      type: control.type,
      options: control.options.map((o) => o.label),
      required: control.required,
    });
  }

  return { fields: clampFields(fields), elements };
}

/** Clamp serialized fields to the server's accepted bounds (defense in depth —
 *  the server clamps too). Truncates over-long text and caps option/field counts. */
export function clampFields(fields: FieldSchema[]): FieldSchema[] {
  return fields.slice(0, LIMITS.maxFields).map((f) => ({
    ...f,
    label: (f.label ?? "").slice(0, LIMITS.maxLabel),
    nearbyText: f.nearbyText
      ? f.nearbyText.slice(0, LIMITS.maxNearbyText)
      : undefined,
    options: f.options
      ? f.options.slice(0, LIMITS.maxOptions).map((o) => o.slice(0, LIMITS.maxOption))
      : undefined,
    charLimit:
      f.charLimit && f.charLimit > LIMITS.maxCharLimit ? LIMITS.maxCharLimit : f.charLimit,
  }));
}

/**
 * Current user-visible value of a field, for agent-assist rounds (the server
 * needs to know what is already filled). Radio groups report the checked
 * radio's label; checkboxes report "true"/"false"; selects report the chosen
 * option's text (empty when only the placeholder is selected). ARIA widgets
 * report the aria-checked/aria-selected option's label.
 */
export function currentFieldValue(el: FillTarget): string {
  if ("kind" in el) {
    const stateAttr = el.type === "radio" ? "aria-checked" : "aria-selected";
    const chosen = el.options.find((o) => o.el.getAttribute(stateAttr) === "true");
    return chosen ? chosen.label : "";
  }
  if (el instanceof HTMLSelectElement) {
    const opt = el.selectedOptions[0];
    return opt && opt.value ? opt.text.trim() : "";
  }
  if (el instanceof HTMLInputElement && el.type === "radio") {
    const group = el.name
      ? Array.from(
          document.querySelectorAll<HTMLInputElement>(
            `input[type="radio"][name="${esc(el.name)}"]`,
          ),
        )
      : [el];
    const checked = group.find((r) => r.checked);
    return checked ? getLabelText(checked) : "";
  }
  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    return el.checked ? "true" : "false";
  }
  return el.value ?? "";
}

function radioOptions(root: ParentNode, name: string): string[] | undefined {
  const radios = Array.from(
    root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${esc(name)}"]`),
  );
  const labels = radios.map((r) => getLabelText(r)).filter(Boolean);
  return labels.length ? labels : undefined;
}
