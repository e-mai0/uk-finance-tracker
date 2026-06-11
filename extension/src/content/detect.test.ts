import { describe, it, expect, beforeEach } from "vitest";
import { hasAnyField, looksLikeApplication } from "./detect";

beforeEach(() => { document.body.innerHTML = ""; });

describe("hasAnyField", () => {
  it("is false on an empty page", () => {
    expect(hasAnyField()).toBe(false);
  });
  it("is true with a single text input", () => {
    document.body.innerHTML = `<input type="text" />`;
    expect(hasAnyField()).toBe(true);
  });
  it("ignores hidden / submit inputs", () => {
    document.body.innerHTML = `<input type="hidden" /><input type="submit" />`;
    expect(hasAnyField()).toBe(false);
  });
});

describe("looksLikeApplication", () => {
  it("is true for a 4-field form with a textarea", () => {
    document.body.innerHTML = `
      <input type="text"/><input type="email"/><input type="tel"/>
      <textarea></textarea>`;
    expect(looksLikeApplication()).toBe(true);
  });
  it("is true for 3 fields plus apply wording", () => {
    document.body.innerHTML = `
      <p>Submit your application and cover letter</p>
      <input type="text"/><input type="email"/><input type="tel"/>`;
    expect(looksLikeApplication()).toBe(true);
  });
  it("is false for exactly 3 fields with no textarea and no apply wording", () => {
    document.body.innerHTML = `
      <p>Newsletter signup</p>
      <input type="text"/><input type="email"/><input type="tel"/>`;
    expect(looksLikeApplication()).toBe(false);
  });
  it("is false for 2 fields regardless of wording", () => {
    document.body.innerHTML = `
      <p>Apply now with your cover letter</p>
      <input type="text"/><input type="email"/>`;
    expect(looksLikeApplication()).toBe(false);
  });
});

describe("looksLikeApplication — form-less layouts", () => {
  it("detects a cluster of inputs not wrapped in a <form>", () => {
    document.body.innerHTML = `
      <div><input type="text"/></div>
      <div><input type="email"/></div>
      <div><input type="tel"/></div>
      <div><textarea></textarea></div>`;
    expect(looksLikeApplication()).toBe(true);
  });

  it("ignores a single stray search box", () => {
    document.body.innerHTML = `<input type="search" placeholder="Search"/>`;
    expect(looksLikeApplication()).toBe(false);
  });
});

describe("detection counts ARIA choice widgets", () => {
  const radiogroup = (label: string) => `
    <div role="radiogroup" aria-label="${label}">
      <div role="radio" aria-label="Yes"></div>
      <div role="radio" aria-label="No"></div>
    </div>`;

  it("hasAnyField is true for an ARIA-only form (no native inputs)", () => {
    document.body.innerHTML = radiogroup("Eligible to work in the UK?");
    expect(hasAnyField()).toBe(true);
  });

  it("looksLikeApplication is true for 4 ARIA radiogroups and no native fields", () => {
    document.body.innerHTML = ["a", "b", "c", "d"].map(radiogroup).join("");
    expect(looksLikeApplication()).toBe(true);
  });

  it("counts native fields and ARIA widgets together toward the threshold", () => {
    document.body.innerHTML = `
      <input type="text"/><input type="email"/>
      ${radiogroup("Sponsorship needed?")}`; // 2 native + 1 ARIA = 3
    document.body.innerHTML += `<p>cover letter</p>`; // apply wording for the 3-field case
    expect(looksLikeApplication()).toBe(true);
  });
});
