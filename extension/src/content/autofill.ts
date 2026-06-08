import { getLabelText } from "./field-map";

/** Set a value the way React's controlled inputs expect (native setter + events). */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Insert text into a specific field (used by the panel's "Insert"). */
export function insertIntoField(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  setNativeValue(el, text);
  el.focus();
}

function fillSelect(sel: HTMLSelectElement, value: string): boolean {
  const v = value.toLowerCase().trim();
  const opts = Array.from(sel.options);
  const exact = opts.find(
    (o) => o.text.toLowerCase().trim() === v || o.value.toLowerCase() === v,
  );
  const loose =
    exact ?? opts.find((o) => o.value && o.text.toLowerCase().includes(v));
  if (loose) {
    sel.value = loose.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

function fillRadioGroup(radios: HTMLInputElement[], desired: string): boolean {
  const v = desired.toLowerCase().trim();
  for (const r of radios) {
    const lbl = getLabelText(r).toLowerCase();
    if (lbl === v || lbl.startsWith(v) || (v && lbl.includes(v))) {
      r.click();
      return true;
    }
  }
  return false;
}

import type { FillableEl } from "./field-map";
import { type AriaControl, fillAriaControl } from "./aria-controls";
import type { FieldSchema, FillPlanItem } from "../shared/types";

/** Anything the planner can target: a native field or a synthetic ARIA widget. */
export type FillTarget = FillableEl | AriaControl;

function isAria(el: FillTarget): el is AriaControl {
  return (el as AriaControl).kind === "aria";
}

export interface PlanQuestion {
  fieldId: string;
  el: FillTarget;          // native field, OR an ARIA radio/listbox widget
  label: string;
  profileKey?: string;
  charLimit?: number;
  options?: string[];      // present for select/radio asks — drives the ask UI
}

export interface AppliedPlan {
  filled: number;
  asks: PlanQuestion[];   // action "ask"
  drafts: PlanQuestion[]; // action "draft"
}

/** Apply a fill plan to the live form; collect ask/draft items for the panel. */
export function applyPlan(
  plan: FillPlanItem[],
  elements: Map<string, FillTarget>,
  schemaById: Map<string, FieldSchema>,
): AppliedPlan {
  let filled = 0;
  const asks: PlanQuestion[] = [];
  const drafts: PlanQuestion[] = [];

  for (const item of plan) {
    const el = elements.get(item.fieldId);
    if (!el) continue;
    const schema = schemaById.get(item.fieldId);
    const label = schema?.label ?? "";

    if (item.action === "fill" && item.value != null) {
      if (setFieldValue(el, item.value)) filled++;
      continue;
    }
    if (item.action === "draft" && el instanceof HTMLTextAreaElement) {
      drafts.push({ fieldId: item.fieldId, el, label, charLimit: schema?.charLimit });
      continue;
    }
    if (item.action === "ask") {
      asks.push({
        fieldId: item.fieldId,
        el,
        label: item.question || label,
        profileKey: item.profileKey,
        options: schema?.options,
      });
    }
  }
  return { filled, asks, drafts };
}

/** Set a value on ANY fillable element type (text/textarea/select/radio). Public so the panel's ask cards can use it. */
export function setFieldValue(el: FillTarget, value: string): boolean {
  if (isAria(el)) return fillAriaControl(el, value);
  if (el instanceof HTMLSelectElement) return fillSelect(el, value);
  if (el instanceof HTMLInputElement && el.type === "radio") {
    const group = el.name
      ? Array.from(
          document.querySelectorAll<HTMLInputElement>(
            `input[type="radio"][name="${CSS.escape(el.name)}"]`,
          ),
        )
      : [el];
    return fillRadioGroup(group, value);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, value);
    return true;
  }
  return false;
}
