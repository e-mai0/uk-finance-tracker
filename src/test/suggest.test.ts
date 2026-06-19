import { describe, expect, it } from "vitest";
import { suggestForLabels } from "@/lib/suggest";

const PROFILE_FACTS = [
  "- Notice period: one month (confidence: high, confirmed: 2026-06-01)",
  "- Preferred office location: London (confidence: high, confirmed: 2026-05-20)",
  "- Dietary requirements: none (confidence: medium, confirmed: 2026-03-01)",
];

const BANK = [
  { questionText: "What is your notice period?", answer: "One month from acceptance." },
  { questionText: "Why do you want to work in markets?", answer: "Because of X and Y." },
];

describe("suggestForLabels", () => {
  it("matches a profile fact by label similarity", () => {
    const [s] = suggestForLabels(["Notice period"], PROFILE_FACTS, []);
    expect(s).toMatchObject({ label: "Notice period", value: "one month", source: "memory", confidence: "high" });
  });

  it("matches an answer-bank item by question similarity", () => {
    const [s] = suggestForLabels(["Please state your notice period"], [], BANK);
    expect(s.source).toBe("bank");
    expect(s.value).toContain("One month");
  });

  it("prefers memory facts over bank answers when both match", () => {
    const [s] = suggestForLabels(["Notice period"], PROFILE_FACTS, BANK);
    expect(s.source).toBe("memory");
  });

  it("returns nothing for unmatched labels", () => {
    expect(suggestForLabels(["Favourite colour"], PROFILE_FACTS, BANK)).toEqual([]);
  });

  it("carries decayed/medium confidence through", () => {
    const [s] = suggestForLabels(["Dietary requirements"], PROFILE_FACTS, []);
    expect(s.confidence).toBe("medium");
  });
});
