import { describe, expect, it } from "vitest";
import { parseVoice } from "@/server/engine/voice";

const VOICE = `# Voice
## Banned tells
- Em dashes
- "I'm excited to"
- circle back

## Observed traits
- Short opening sentences (confidence: medium, confirmed: 2026-06-09)
- Uses contractions (confidence: medium, confirmed: 2026-06-09)

## Exemplars
> I joined the rowing club because I liked the 5am starts. That's the honest answer.
`;

describe("parseVoice", () => {
  it("extracts banned tells, traits, exemplars", () => {
    const v = parseVoice(VOICE);
    expect(v.bannedTells).toContain("circle back");
    expect(v.bannedTells).toContain("I'm excited to"); // quotes stripped
    expect(v.traits).toHaveLength(2);
    expect(v.exemplars).toContain("5am starts");
  });

  it("handles a missing section gracefully", () => {
    const v = parseVoice("# Voice\n## Banned tells\n- x\n");
    expect(v.traits).toEqual([]);
    expect(v.exemplars).toBe("");
  });
});
