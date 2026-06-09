import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({ generateText: generateMock.generateText }));

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
});

describe("critiqueAndRevise", () => {
  it("returns the draft untouched when no tells found", async () => {
    const out = await critiqueAndRevise("u1", "Clean draft.", { bannedTells: [], traits: [], exemplars: "" });
    expect(out).toEqual({ text: "Clean draft.", checksFailed: [], revised: false });
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
});
