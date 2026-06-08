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
});
