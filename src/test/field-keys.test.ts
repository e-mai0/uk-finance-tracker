import { describe, it, expect } from "vitest";
import { matchKey, classifyQuestion } from "../lib/field-keys";

describe("matchKey", () => {
  it("maps common labels to known profile keys", () => {
    expect(matchKey("Email address")).toBe("email");
    expect(matchKey("First name")).toBe("firstName");
    expect(matchKey("LinkedIn profile")).toBe("linkedinUrl");
    expect(matchKey("Which university do you attend?")).toBe("university");
    expect(matchKey("Do you require sponsorship?")).toBe("requiresSponsorship");
  });

  it("returns null for an unrecognized label", () => {
    expect(matchKey("Favourite trading strategy")).toBeNull();
  });

  it("prefers the more specific firstName over fullName", () => {
    expect(matchKey("First name")).toBe("firstName");
  });
});

describe("classifyQuestion", () => {
  it("treats a long textarea prompt as an essay", () => {
    expect(
      classifyQuestion("Why do you want to work at Citadel?", "textarea"),
    ).toBe("essay");
  });

  it("treats a short factual field as factual", () => {
    expect(classifyQuestion("Expected salary", "number")).toBe("factual");
  });

  it("treats a textarea address block (no question hint) as factual", () => {
    expect(classifyQuestion("Additional information", "textarea")).toBe("factual");
  });
});
