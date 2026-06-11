import { describe, it, expect, beforeEach } from "vitest";
import { setFieldValue } from "./autofill";
import { collectAriaControls } from "./aria-controls";

beforeEach(() => { document.body.innerHTML = ""; });

describe("setFieldValue — ARIA controls", () => {
  it("clicks the matching ARIA radio option", () => {
    document.body.innerHTML = `
      <div role="radiogroup" aria-label="Sponsorship needed?">
        <div role="radio" aria-label="Yes"></div>
        <div role="radio" aria-label="No"></div>
      </div>`;
    const [control] = collectAriaControls(document.body);
    let clicked = "";
    control.options.forEach((o) =>
      o.el.addEventListener("click", () => (clicked = o.label)),
    );
    expect(setFieldValue(control, "No")).toBe(true);
    expect(clicked).toBe("No");
  });

  it("returns true and sets a native text input value", () => {
    document.body.innerHTML = `<input id="t" type="text" />`;
    const input = document.getElementById("t") as HTMLInputElement;
    expect(setFieldValue(input, "hello")).toBe(true);
    expect(input.value).toBe("hello");
  });
});
