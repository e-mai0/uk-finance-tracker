import { describe, expect, it } from "vitest";
import {
  isAllowedMemoryPath,
  stripDecayAnnotations,
  normalizeReasons,
} from "@/server/ai/tool-guards";

describe("isAllowedMemoryPath", () => {
  it("allows profile.md", () => {
    expect(isAllowedMemoryPath("profile.md")).toBe(true);
  });
  it("allows voice.md", () => {
    expect(isAllowedMemoryPath("voice.md")).toBe(true);
  });
  it("allows strategy.md", () => {
    expect(isAllowedMemoryPath("strategy.md")).toBe(true);
  });
  it("allows stories/rowing-captain.md", () => {
    expect(isAllowedMemoryPath("stories/rowing-captain.md")).toBe(true);
  });
  it("allows companies/goldman-sachs.md", () => {
    expect(isAllowedMemoryPath("companies/goldman-sachs.md")).toBe(true);
  });
  it("rejects arbitrary path like notes.md", () => {
    expect(isAllowedMemoryPath("notes.md")).toBe(false);
  });
  it("rejects path traversal attempt", () => {
    expect(isAllowedMemoryPath("../profile.md")).toBe(false);
  });
  it("rejects uppercase path", () => {
    expect(isAllowedMemoryPath("Profile.md")).toBe(false);
  });
  it("rejects stories path with uppercase", () => {
    expect(isAllowedMemoryPath("stories/My-Story.md")).toBe(false);
  });
  it("allows stories path with digits", () => {
    expect(isAllowedMemoryPath("stories/internship-2024.md")).toBe(true);
  });
});

describe("stripDecayAnnotations", () => {
  it("strips [decayed to: low] annotation", () => {
    const input = "- Some fact (confidence: high, confirmed: 2026-01-01)  [decayed to: low]";
    expect(stripDecayAnnotations(input)).toBe(
      "- Some fact (confidence: high, confirmed: 2026-01-01)"
    );
  });
  it("strips [decayed to: medium] annotation", () => {
    const input = "- Other fact (confidence: high, confirmed: 2026-01-01)  [decayed to: medium]";
    expect(stripDecayAnnotations(input)).toBe(
      "- Other fact (confidence: high, confirmed: 2026-01-01)"
    );
  });
  it("strips [decayed to: high] annotation (defensive)", () => {
    const input = "- Fact  [decayed to: high]";
    expect(stripDecayAnnotations(input)).toBe("- Fact");
  });
  it("leaves clean content unchanged", () => {
    const clean = "- Some fact (confidence: high, confirmed: 2026-01-01)";
    expect(stripDecayAnnotations(clean)).toBe(clean);
  });
});

describe("normalizeReasons", () => {
  it("returns an array as-is when already an array", () => {
    expect(normalizeReasons(["good fit", "strong match"])).toEqual(["good fit", "strong match"]);
  });
  it("parses a JSON string array", () => {
    expect(normalizeReasons('["reason one","reason two"]')).toEqual(["reason one", "reason two"]);
  });
  it("wraps a plain string in an array", () => {
    expect(normalizeReasons("single reason")).toEqual(["single reason"]);
  });
  it("returns empty array for null", () => {
    expect(normalizeReasons(null)).toEqual([]);
  });
  it("returns empty array for undefined", () => {
    expect(normalizeReasons(undefined)).toEqual([]);
  });
  it("returns empty array for a number", () => {
    expect(normalizeReasons(42)).toEqual([]);
  });
  it("returns empty array for invalid JSON string", () => {
    expect(normalizeReasons("{not valid}")).toEqual(["{not valid}"]);
  });
});
