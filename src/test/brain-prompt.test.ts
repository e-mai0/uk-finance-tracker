import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/server/ai/brain";

describe("system prompt", () => {
  const core = [
    { path: "profile.md", content: "# Profile\n- LSE economics (confidence: high, confirmed: 2026-06-01)" },
    { path: "voice.md", content: "# Voice\n## Banned tells\n- Em dashes" },
    { path: "strategy.md", content: "# Strategy\n## Current direction\n- quant (confidence: medium, confirmed: 2026-06-01)" },
  ];

  it("includes core memory files and identity", () => {
    const p = buildSystemPrompt(core, []);
    expect(p).toContain("Cyclops");
    expect(p).toContain("LSE economics");
    expect(p).toContain("Banned tells");
  });

  it("forbids asserting medium/low confidence memory as fact", () => {
    const p = buildSystemPrompt(core, []);
    expect(p.toLowerCase()).toContain("confidence");
    expect(p).toContain("never assert");
  });

  it("injects pending gardener questions", () => {
    const p = buildSystemPrompt(core, ["In March you said macro - still true?"]);
    expect(p).toContain("still true?");
  });
});
