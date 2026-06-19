import { describe, expect, it } from "vitest";
import { writingSkill } from "@/server/engine/skills";

// The writing-skill body is split at the per-user {{voice}} seam so the large static
// playbook/craft prefix can be sent under an Anthropic prompt-cache breakpoint while
// the per-user voice + tailoring stay uncached. These tests pin that the split is
// loss-less (byte-identical reassembly) and that the cached prefix is genuinely static.
describe("writingSkill static cache split", () => {
  it("reassembles to the exact original body with the voice token restored (no byte changes)", () => {
    expect(
      `${writingSkill.bodyStaticPrefix}{{voice}}${writingSkill.bodyStaticSuffix}`,
    ).toBe(writingSkill.body);
  });

  it("the cacheable static prefix carries the playbook/craft content and the {{voice}} token does NOT leak into it", () => {
    // Bulk craft + expert standards live in the prefix (so the cache hit is worth it).
    expect(writingSkill.bodyStaticPrefix).toContain("EXPERT STANDARDS");
    expect(writingSkill.bodyStaticPrefix).toContain("competitor-swap");
    expect(writingSkill.bodyStaticPrefix).toContain("never invent facts");
    // The dynamic seam must NOT remain in the static prefix.
    expect(writingSkill.bodyStaticPrefix).not.toContain("{{voice}}");
  });

  it("the static prefix comfortably exceeds Sonnet's ~1024-token cache minimum", () => {
    // ~3.5 chars/token is a conservative lower bound for English prose; require the
    // prefix to clear ~1024 tokens with margin so the cache write is never wasted.
    expect(writingSkill.bodyStaticPrefix.length).toBeGreaterThan(1024 * 3.5);
  });

  it("contains no obviously per-request dynamic tokens (no user/firm/timestamp interpolation)", () => {
    // A static prefix must not carry mustache placeholders or interpolated identifiers.
    expect(writingSkill.bodyStaticPrefix).not.toMatch(/\{\{[a-z]+\}\}/);
    expect(writingSkill.bodyStaticPrefix).not.toMatch(/\$\{/);
  });
});
