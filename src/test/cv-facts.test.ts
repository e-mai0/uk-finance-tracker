import { describe, it, expect } from "vitest";
import { sanitiseCvFacts, stripCvHighlights } from "@/server/cv/facts";

describe("sanitiseCvFacts", () => {
  it("trims, collapses whitespace, drops empties and dupes, caps at 8 and 200 chars", () => {
    const out = sanitiseCvFacts([
      "  interned at   Barclays  ",
      "interned at Barclays",
      "",
      "   ",
      "x".repeat(300),
      ...Array.from({ length: 10 }, (_, i) => `fact ${i}`),
    ]);
    expect(out[0]).toBe("interned at Barclays");
    expect(out.filter((f) => f === "interned at Barclays")).toHaveLength(1);
    expect(out.every((f) => f.length <= 200)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(8);
  });
});

describe("stripCvHighlights", () => {
  it("removes only cv highlight fact lines", () => {
    const content = [
      "# Profile",
      "- university: Cambridge (confidence: high, confirmed: 2026-06-11)",
      "- cv highlight 1: interned at Barclays (confidence: high, confirmed: 2026-06-11)",
      "- cv highlight 2: built a DCF model (confidence: high, confirmed: 2026-06-11)",
      "",
    ].join("\n");
    const out = stripCvHighlights(content);
    expect(out).toContain("university: Cambridge");
    expect(out).not.toContain("cv highlight");
  });
});
