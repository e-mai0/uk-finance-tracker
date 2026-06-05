import {
  getLabelText,
  matchKey,
  isFreeTextQuestion,
  collectFields,
} from "./field-map";

export interface FreeTextQuestion {
  el: HTMLTextAreaElement;
  label: string;
  charLimit?: number;
}

export interface FillResult {
  filled: number;
  questions: FreeTextQuestion[];
}

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

/**
 * Fill recognized fields in a container from the field map, and collect any
 * free-text questions for the AI panel. Never touches submit buttons.
 */
export function fillForm(
  root: ParentNode,
  fields: Record<string, string>,
): FillResult {
  let filled = 0;
  const questions: FreeTextQuestion[] = [];
  const seenRadioGroups = new Set<string>();

  for (const el of collectFields(root)) {
    // Radio groups: resolve the question label, then pick the option.
    if (el instanceof HTMLInputElement && el.type === "radio") {
      const name = el.name;
      if (!name || seenRadioGroups.has(name)) continue;
      seenRadioGroups.add(name);
      const group = Array.from(
        root.querySelectorAll<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(name)}"]`,
        ),
      );
      const fieldset = el.closest("fieldset");
      const qLabel =
        fieldset?.querySelector("legend")?.textContent?.trim() ||
        getLabelText(el.closest("[class*=field], [class*=question]") ?? el);
      const key = matchKey(qLabel ?? "");
      if (key && fields[key]) {
        if (fillRadioGroup(group, fields[key])) filled++;
      }
      continue;
    }

    const label = getLabelText(el);
    const key = matchKey(label);

    if (el instanceof HTMLSelectElement) {
      if (key && fields[key] && fillSelect(el, fields[key])) filled++;
      continue;
    }

    if (el instanceof HTMLTextAreaElement) {
      if (key && fields[key]) {
        setNativeValue(el, fields[key]);
        filled++;
      } else if (isFreeTextQuestion(el, label)) {
        questions.push({
          el,
          label,
          charLimit: el.maxLength > 0 ? el.maxLength : undefined,
        });
      }
      continue;
    }

    if (el instanceof HTMLInputElement) {
      if (key && fields[key] && !el.value) {
        setNativeValue(el, fields[key]);
        filled++;
      }
    }
  }

  return { filled, questions };
}
