import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({ generateText: generateMock.generateText }));
vi.mock("@/server/ai/budget", () => ({ recordUsage: vi.fn(async () => {}) }));

import { checkTells, critiqueAndRevise, GLOBAL_TELLS } from "@/server/engine/critique";

describe("checkTells", () => {
  it("flags em dashes and global tells", () => {
    const v = checkTells("I'm excited to delve into markets — truly.", []);
    expect(v).toEqual(expect.arrayContaining(["em dash", "I'm excited", "delve"]));
  });

  it("flags user-specific banned tells case-insensitively", () => {
    expect(checkTells("Let me Circle Back on that.", ["circle back"])).toContain("circle back");
  });

  it("passes clean text", () => {
    expect(checkTells("I rebuilt the budget in a week. It worked.", [])).toEqual([]);
  });

  it("ignores the section-marker tell 'Em dashes' as literal text", () => {
    // "Em dashes" appears in voice.md's banned list as a description, not a literal string;
    // the em-dash check is character-based.
    expect(checkTells("plain text", ["Em dashes"])).toEqual([]);
  });

  // Item 8: curly quote normalization
  it("flags 'I’m excited' (curly apostrophe) as a tell", () => {
    // U+2019 is the right single quotation mark / curly apostrophe
    const text = "I’m excited to join the team.";
    const found = checkTells(text, []);
    expect(found).toContain("I'm excited");
  });

  it("flags a user tell written with curly apostrophe", () => {
    const text = "let’s circle back on this";
    const found = checkTells(text, ["let's circle back"]);
    expect(found).toContain("let's circle back");
  });

  // Item 9: en dash allowed, em dash flagged
  it("does NOT flag en dash (U+2013) as em dash", () => {
    const text = "Years 2020–2023 were formative.";
    expect(checkTells(text, [])).not.toContain("em dash");
  });

  it("flags em dash (U+2014) as em dash", () => {
    const text = "I loved it — truly.";
    expect(checkTells(text, [])).toContain("em dash");
  });
});

describe("critiqueAndRevise", () => {
  it("returns the draft untouched when no tells found", async () => {
    const out = await critiqueAndRevise("u1", "Clean draft.", { bannedTells: [], traits: [], exemplars: "" });
    expect(out).toEqual({ text: "Clean draft.", checksFailed: [], revised: false, residualTells: [] });
    expect(generateMock.generateText).not.toHaveBeenCalled();
  });

  it("revises when tells found and keeps the better version", async () => {
    generateMock.generateText.mockResolvedValueOnce({ text: "I want to dig into markets. Honestly.", usage: { totalTokens: 50 } });
    const out = await critiqueAndRevise("u1", "I'm excited to delve into markets — truly.", {
      bannedTells: [],
      traits: [],
      exemplars: "",
    });
    expect(out.revised).toBe(true);
    expect(out.checksFailed.length).toBeGreaterThan(0);
    expect(out.text).toBe("I want to dig into markets. Honestly.");
  });

  it("keeps the original if the revision is worse", async () => {
    generateMock.generateText.mockResolvedValueOnce({ text: "I'm excited to delve — and delve again — into this.", usage: {} });
    const out = await critiqueAndRevise("u1", "One em dash — only.", { bannedTells: [], traits: [], exemplars: "" });
    expect(out.text).toBe("One em dash — only.");
  });

  // Item 3: partial-revision case reports residualTells non-empty
  it("reports residualTells non-empty when revision removes some but not all tells", async () => {
    // Draft has em dash + "delve". Revision removes em dash but keeps "delve".
    generateMock.generateText.mockResolvedValueOnce({
      text: "I want to delve into markets. Clean line.",
      usage: { totalTokens: 50 },
    });
    const out = await critiqueAndRevise("u1", "I want to delve — into markets.", {
      bannedTells: [],
      traits: [],
      exemplars: "",
    });
    // revised=true (fewer tells: 2->1)
    expect(out.revised).toBe(true);
    expect(out.residualTells).toContain("delve");
    expect(out.residualTells.length).toBeGreaterThan(0);
  });

  it("returns residualTells for the unchanged original when revision is rejected", async () => {
    generateMock.generateText.mockResolvedValueOnce({ text: "I'm excited to delve — again and again.", usage: {} });
    const out = await critiqueAndRevise("u1", "One em dash — only.", { bannedTells: [], traits: [], exemplars: "" });
    // original kept; residualTells = original tells
    expect(out.residualTells).toContain("em dash");
  });
});
