import { describe, expect, it } from "vitest";
import {
  parseFactLine,
  formatFactLine,
  effectiveConfidence,
  volatilityFor,
  applyFact,
  annotateDecay,
} from "@/server/memory/facts";

describe("fact annotations", () => {
  it("parses a fact line with annotation", () => {
    const f = parseFactLine(
      "- Got a first in securities module (confidence: high, confirmed: 2026-06-01)",
    );
    expect(f).toEqual({
      text: "Got a first in securities module",
      confidence: "high",
      confirmed: "2026-06-01",
    });
  });

  it("returns null for non-fact lines", () => {
    expect(parseFactLine("## Section")).toBeNull();
    expect(parseFactLine("- bare bullet without annotation")).toBeNull();
  });

  it("round-trips through formatFactLine", () => {
    const line = formatFactLine({ text: "Targets quant research", confidence: "medium", confirmed: "2026-06-09" });
    expect(parseFactLine(line)).toEqual({ text: "Targets quant research", confidence: "medium", confirmed: "2026-06-09" });
  });
});

describe("confidence decay", () => {
  const now = new Date("2026-06-09T00:00:00Z");
  it("volatile facts decay to low after 30 days unconfirmed", () => {
    expect(effectiveConfidence({ text: "x", confidence: "high", confirmed: "2026-04-01" }, "volatile", now)).toBe("low");
    expect(effectiveConfidence({ text: "x", confidence: "high", confirmed: "2026-06-01" }, "volatile", now)).toBe("high");
  });
  it("stable facts degrade one level after 180 days", () => {
    expect(effectiveConfidence({ text: "x", confidence: "high", confirmed: "2025-11-01" }, "stable", now)).toBe("medium");
    expect(effectiveConfidence({ text: "x", confidence: "low", confirmed: "2025-01-01" }, "stable", now)).toBe("low");
  });

  it("returns low when confirmed date is invalid (NaN guard)", () => {
    expect(
      effectiveConfidence(
        { text: "x", confidence: "high", confirmed: "not-a-date" },
        "volatile",
        new Date("2026-06-09"),
      ),
    ).toBe("low");
  });
});

describe("volatility classes", () => {
  it("classifies paths per spec §5.5", () => {
    expect(volatilityFor("strategy.md")).toBe("volatile");
    expect(volatilityFor("profile.md")).toBe("stable");
    expect(volatilityFor("stories/rowing.md")).toBe("stable");
    expect(volatilityFor("companies/goldman-sachs.md")).toBe("stable");
  });
});

describe("applyFact", () => {
  const today = "2026-06-09";
  const base = "# Profile\n\n## Academics\n\n## Interests\n";

  it("appends a new fact when label is absent", () => {
    const result = applyFact(base, "University", "Oxford", today);
    expect(result).toContain(
      "- University: Oxford (confidence: high, confirmed: 2026-06-09)",
    );
    // The original content is preserved
    expect(result).toContain("# Profile");
  });

  it("supersedes an existing label on the same line", () => {
    const existing =
      base + "- University: Cambridge (confidence: high, confirmed: 2026-01-01)\n";
    const result = applyFact(existing, "University", "Oxford", today);
    expect(result).not.toContain("Cambridge");
    expect(result).toContain(
      "- University: Oxford (confidence: high, confirmed: 2026-06-09)",
    );
  });

  it("returns identical content when same-day identical value (no-op)", () => {
    const existing =
      base +
      "- University: Oxford (confidence: high, confirmed: 2026-06-09)\n";
    const result = applyFact(existing, "University", "Oxford", today);
    expect(result).toBe(existing);
  });

  it("collapses multiline label to one line", () => {
    const result = applyFact(base, "My\nlabel\nhere", "some value", today);
    expect(result).toContain("- My label here: some value");
  });

  it("collapses multiline value to one line", () => {
    const result = applyFact(base, "Note", "line one\nline two", today);
    expect(result).toContain("- Note: line one line two");
    // Must not contain a bare newline inside the fact line itself
    const lines = result.split("\n");
    const factLine = lines.find((l) => l.startsWith("- Note:"));
    expect(factLine).toBeTruthy();
    expect(factLine).toContain("line one line two");
  });

  it("strips (confidence: ... from value to prevent fabricated second fact", () => {
    const evil = "legit value (confidence: high, confirmed: 2099-01-01)";
    const result = applyFact(base, "Employer", evil, today);
    // Only one parseable fact line should exist
    const factLines = result
      .split("\n")
      .map((l) => parseFactLine(l))
      .filter(Boolean);
    expect(factLines).toHaveLength(1);
    expect(factLines[0]!.text).toContain("Employer: legit value");
    expect(factLines[0]!.confirmed).toBe(today);
  });

  it("handles label with regex metacharacters (C++ (preferred)?)", () => {
    const label = "C++ (preferred)?";
    const result = applyFact(base, label, "yes", today);
    expect(result).toContain("- C++ (preferred)?: yes");
    // Supersede works too
    const result2 = applyFact(result, label, "no", today);
    expect(result2).not.toContain("yes");
    expect(result2).toContain("- C++ (preferred)?: no");
  });

  it("does NOT match a mid-line mention of the label (- Note: see - Visa: section)", () => {
    // "Visa" appears mid-line; applyFact must not treat that as an existing Visa fact
    const content =
      base + "- Note: see - Visa: section for details\n";
    const result = applyFact(content, "Visa", "sponsored", today);
    // Should append, not replace
    expect(result).toContain("- Note: see - Visa: section for details");
    expect(result).toContain(
      "- Visa: sponsored (confidence: high, confirmed: 2026-06-09)",
    );
  });
});

describe("annotateDecay", () => {
  const now = new Date("2026-06-09T00:00:00Z");

  it("volatile fact older than 30 days gets [decayed to: low] annotation", () => {
    const content = "- Targeting quant (confidence: high, confirmed: 2026-04-01)\n";
    // strategy.md is volatile, confirmed 2026-04-01 is 69 days before now → decays to low
    const result = annotateDecay("strategy.md", content, now);
    expect(result).toContain("[decayed to: low]");
  });

  it("fresh volatile fact (within 30 days) is not annotated", () => {
    const content = "- Targeting quant (confidence: high, confirmed: 2026-06-01)\n";
    const result = annotateDecay("strategy.md", content, now);
    expect(result).not.toContain("[decayed to:");
  });

  it("non-fact lines (headings, blanks) are returned unchanged", () => {
    const content = "## Section heading\n\nSome plain text\n";
    const result = annotateDecay("profile.md", content, now);
    expect(result).toBe(content);
  });
});
