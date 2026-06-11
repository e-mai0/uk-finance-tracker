import { describe, it, expect, beforeEach } from "vitest";
import { collectAriaControls, fillAriaControl } from "./aria-controls";

beforeEach(() => { document.body.innerHTML = ""; });

const RADIO_GROUP = `
  <div role="radiogroup" aria-label="Are you eligible to work in the UK?">
    <div role="radio" aria-label="Yes"></div>
    <div role="radio" aria-label="No"></div>
  </div>`;

describe("collectAriaControls", () => {
  it("finds a radiogroup with its options", () => {
    document.body.innerHTML = RADIO_GROUP;
    const controls = collectAriaControls(document.body);
    expect(controls.length).toBe(1);
    expect(controls[0].type).toBe("radio");
    expect(controls[0].label).toBe("Are you eligible to work in the UK?");
    expect(controls[0].options.map((o) => o.label)).toEqual(["Yes", "No"]);
  });

  it("finds a listbox as a select", () => {
    document.body.innerHTML = `
      <div role="listbox" aria-label="Country">
        <div role="option" aria-label="United Kingdom"></div>
        <div role="option" aria-label="United States"></div>
      </div>`;
    const [c] = collectAriaControls(document.body);
    expect(c.type).toBe("select");
    expect(c.options.length).toBe(2);
  });
});

describe("fillAriaControl", () => {
  it("clicks the matching option", () => {
    document.body.innerHTML = RADIO_GROUP;
    const [c] = collectAriaControls(document.body);
    let clicked = "";
    c.options.forEach((o) => o.el.addEventListener("click", () => (clicked = o.label)));
    expect(fillAriaControl(c, "Yes")).toBe(true);
    expect(clicked).toBe("Yes");
  });

  it("returns false when no option matches", () => {
    document.body.innerHTML = RADIO_GROUP;
    const [c] = collectAriaControls(document.body);
    expect(fillAriaControl(c, "Maybe")).toBe(false);
  });
});
