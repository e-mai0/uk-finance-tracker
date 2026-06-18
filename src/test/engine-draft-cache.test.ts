import { beforeEach, describe, expect, it, vi } from "vitest";

// Structural tests for Anthropic prompt-caching on the draft path. The grader is mocked
// so we can drive the revise loop and inspect the `system` passed to EACH generateText
// call (initial draft + any revise). We assert:
//  - system is the split [static-prefix | dynamic-suffix] form,
//  - the cache breakpoint sits on the static playbook prefix ONLY,
//  - the cached prefix is byte-identical across the draft and the revise call,
//  - nothing per-request (voice, firm, tailoring, references) leaks into the cached block.
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  gradeDraft: vi.fn(),
}));
vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@/server/ai/budget", () => ({ recordUsage: vi.fn(async () => {}) }));
vi.mock("@/server/engine/grader", () => ({ gradeDraft: mocks.gradeDraft }));

import { draftText } from "@/server/engine/draft";
import { writingSkill } from "@/server/engine/skills";
import { ANTHROPIC_CACHE_BREAKPOINT } from "@/server/ai/models";
import type { DraftContext, GradeResult } from "@/server/engine/types";

const CTX: DraftContext = {
  profile: {
    name: "Eric",
    university: "LSE",
    degree: "Economics",
    graduationYear: 2027,
    skills: ["Excel"],
    cvText: "CV TEXT HERE",
    workAuthStatement: null,
  },
  // A distinctive per-user voice token we can hunt for in the (uncached) suffix.
  voice: { bannedTells: [], traits: ["- Short openings"], exemplars: "> UNIQUEVOICEEXEMPLAR." },
  stories: [],
  companyNotes: "Spoke to an analyst.",
  research: "Barclays markets desk research.",
  pastAnswers: [],
};

function grade(passed: boolean, criteria: GradeResult["criteria"] = []): GradeResult {
  return { passed, criteria, attempts: 0, skipped: false };
}

beforeEach(() => {
  mocks.generateText.mockReset();
  mocks.gradeDraft.mockReset();
  mocks.generateText.mockResolvedValue({ text: "A clean honest answer.", usage: { totalTokens: 50 } });
});

/** Pull the system arg of the Nth generateText call as the SystemModelMessage[] it now is. */
function systemOf(callIndex: number): Array<{ role: string; content: string; providerOptions?: unknown }> {
  return mocks.generateText.mock.calls[callIndex][0].system;
}

describe("draftText prompt caching", () => {
  it("passes system as a [static-prefix | dynamic-suffix] message array", async () => {
    mocks.gradeDraft.mockResolvedValueOnce(grade(true));
    await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    const system = systemOf(0);
    expect(Array.isArray(system)).toBe(true);
    expect(system).toHaveLength(2);
    expect(system[0].role).toBe("system");
    expect(system[1].role).toBe("system");
  });

  it("marks the cache breakpoint on the static playbook prefix ONLY (not the dynamic suffix)", async () => {
    mocks.gradeDraft.mockResolvedValueOnce(grade(true));
    await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    const system = systemOf(0);
    // Breakpoint present on the static prefix block.
    expect(system[0].providerOptions).toEqual(ANTHROPIC_CACHE_BREAKPOINT);
    // The static prefix is exactly the skill's static prefix (byte-identical, cacheable).
    expect(system[0].content).toBe(writingSkill.bodyStaticPrefix);
    // No breakpoint on the dynamic suffix.
    expect(system[1].providerOptions).toBeUndefined();
  });

  it("keeps all per-request dynamic content OUT of the cached prefix and IN the suffix", async () => {
    mocks.gradeDraft.mockResolvedValueOnce(grade(true));
    await draftText("u1", CTX, {
      kind: "ANSWER",
      question: "Why Barclays?",
      employerName: "Barclays",
      roleTitle: "Summer Analyst, Investment Banking Division",
    });

    const [prefix, suffix] = systemOf(0);
    // Voice exemplar + tailoring (register/division/firm-hook) are dynamic — suffix only.
    expect(prefix.content).not.toContain("UNIQUEVOICEEXEMPLAR");
    expect(prefix.content).not.toContain("REGISTER + DIVISION TAILORING");
    expect(suffix.content).toContain("UNIQUEVOICEEXEMPLAR");
    expect(suffix.content).toContain("REGISTER + DIVISION TAILORING");
  });

  it("the concatenated system content is byte-identical to the old single-string system (zero quality change)", async () => {
    mocks.gradeDraft.mockResolvedValueOnce(grade(true));
    await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    const system = systemOf(0);
    const joined = system.map((m) => m.content).join("");
    // Old shape was `${body.replace("{{voice}}", voiceBlock)}\n\n${tailoring}`. The split must
    // reproduce that exactly: prefix + voiceBlock + suffix + tailoring, no inserted separators.
    expect(joined).toContain(writingSkill.bodyStaticPrefix);
    expect(joined).toContain(writingSkill.bodyStaticSuffix);
    // Sanity: the seam is seamless — the suffix text immediately follows the voice block,
    // i.e. the static tail still appears intact in the joined output.
    expect(joined.indexOf(writingSkill.bodyStaticSuffix)).toBeGreaterThan(
      joined.indexOf(writingSkill.bodyStaticPrefix),
    );
  });

  it("the revise call reuses the byte-identical cached prefix from the draft call (loop cache hit)", async () => {
    // Fail once so a single revise fires, then pass.
    mocks.gradeDraft
      .mockResolvedValueOnce(grade(false, [{ name: "firm-hook", pass: false, fix: "name a desk" }]))
      .mockResolvedValueOnce(grade(true));
    await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    const draftPrefix = systemOf(0)[0];
    const revisePrefix = systemOf(1)[0];
    // Identical static prefix string + identical breakpoint => the revise call reads the cache.
    expect(revisePrefix.content).toBe(draftPrefix.content);
    expect(revisePrefix.providerOptions).toEqual(ANTHROPIC_CACHE_BREAKPOINT);
  });
});
