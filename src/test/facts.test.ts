import { describe, expect, it } from "vitest";
import {
  parseFactLine,
  formatFactLine,
  effectiveConfidence,
  volatilityFor,
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
});

describe("volatility classes", () => {
  it("classifies paths per spec §5.5", () => {
    expect(volatilityFor("strategy.md")).toBe("volatile");
    expect(volatilityFor("profile.md")).toBe("stable");
    expect(volatilityFor("stories/rowing.md")).toBe("stable");
    expect(volatilityFor("companies/goldman-sachs.md")).toBe("stable");
  });
});
