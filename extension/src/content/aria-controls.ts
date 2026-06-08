/**
 * Google Forms (and some custom ATS) render radios, checkboxes, and dropdowns as
 * ARIA widgets (<div role="radio">…) rather than native inputs, so the native
 * serializer/autofill miss them. This module discovers those widgets, exposes
 * them as synthetic fields, and fills them by clicking the chosen option.
 */
import type { FieldType } from "../shared/types";

export interface AriaControl {
  kind: "aria";
  type: Extract<FieldType, "radio" | "select">;
  root: HTMLElement;
  label: string;
  options: { label: string; el: HTMLElement }[];
  required: boolean;
}

function ariaLabel(el: Element): string {
  const direct = el.getAttribute("aria-label");
  if (direct) return direct.replace(/\s+/g, " ").trim();
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const ref = by
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (ref) return ref;
  }
  return "";
}

/** Discover ARIA radiogroups and listboxes under root. */
export function collectAriaControls(root: ParentNode): AriaControl[] {
  const controls: AriaControl[] = [];

  root.querySelectorAll<HTMLElement>('[role="radiogroup"]').forEach((group) => {
    const options = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'))
      .map((el) => ({ label: ariaLabel(el), el }))
      .filter((o) => o.label);
    if (options.length) {
      controls.push({
        kind: "aria", type: "radio", root: group,
        label: ariaLabel(group), options,
        required: group.getAttribute("aria-required") === "true",
      });
    }
  });

  root.querySelectorAll<HTMLElement>('[role="listbox"]').forEach((box) => {
    const options = Array.from(box.querySelectorAll<HTMLElement>('[role="option"]'))
      .map((el) => ({ label: ariaLabel(el), el }))
      .filter((o) => o.label && o.label.toLowerCase() !== "choose");
    if (options.length) {
      controls.push({
        kind: "aria", type: "select", root: box,
        label: ariaLabel(box), options,
        required: box.getAttribute("aria-required") === "true",
      });
    }
  });

  return controls;
}

/** Fill an ARIA control by clicking the option whose label best matches value. */
export function fillAriaControl(control: AriaControl, value: string): boolean {
  const v = value.toLowerCase().trim();
  const match =
    control.options.find((o) => o.label.toLowerCase().trim() === v) ??
    control.options.find((o) => v !== "" && o.label.toLowerCase().includes(v));
  if (!match) return false;
  match.el.click();
  return true;
}
