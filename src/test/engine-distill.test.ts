import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateObject: vi.fn() }));
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));

import { distillTraits, mergeTraits } from "@/server/engine/distill";

describe("distillTraits", () => {
  it("turns edit pairs into trait lines via the LLM", async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: { traits: ["Cuts openings to one short sentence", "Never uses 'utilise'"] },
      usage: { totalTokens: 80 },
    });
    const traits = await distillTraits("u1", [{ original: "long opening...", edited: "Short." }]);
    expect(traits).toHaveLength(2);
  });
});

describe("mergeTraits", () => {
  const VOICE = `# Voice\n## Banned tells\n- Em dashes\n\n## Observed traits\n- Uses contractions (confidence: medium, confirmed: 2026-06-01)\n\n## Exemplars\n> x\n`;
  it("appends new annotated trait lines under Observed traits", () => {
    const out = mergeTraits(VOICE, ["Cuts openings short"], "2026-06-10");
    expect(out).toContain("- Cuts openings short (confidence: medium, confirmed: 2026-06-10)");
    expect(out.indexOf("Cuts openings short")).toBeGreaterThan(out.indexOf("## Observed traits"));
    expect(out.indexOf("Cuts openings short")).toBeLessThan(out.indexOf("## Exemplars"));
  });
  it("skips traits already present (case-insensitive)", () => {
    const out = mergeTraits(VOICE, ["uses contractions"], "2026-06-10");
    expect(out).toBe(VOICE);
  });
});
