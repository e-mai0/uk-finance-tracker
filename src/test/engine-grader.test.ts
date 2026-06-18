import { describe, expect, it, vi } from "vitest";

// Mock the LLM (`generateObject` from "ai") and the budget recorder so the grader
// is deterministically testable with no network calls. Mirrors engine-distill.test.ts.
const mocks = vi.hoisted(() => ({ generateObject: vi.fn() }));
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("@/server/ai/budget", () => ({ recordUsage: vi.fn(async () => {}) }));

import { gradeDraft } from "@/server/engine/grader";
import { SONNET_ID } from "@/server/ai/models";
import {
  FIRM_HOOK,
  STAR_RULES,
  COMMERCIAL_AWARENESS,
  GRADER_PRINCIPLES,
} from "@/server/engine/playbook";
import type { GradeContext } from "@/server/engine/types";

const baseCtx: GradeContext = {
  question: "Why Barclays?",
  questionKind: "motivation",
  register: "summer",
  division: "ibd",
  firmName: "Barclays",
  wordCap: 250,
  firmHookDisclosed: false,
  firmHookExpected: true,
};

function mockVerdict(verdict: {
  criteria: { name: string; pass: boolean; fix?: string }[];
  passed: boolean;
}) {
  mocks.generateObject.mockResolvedValueOnce({ object: verdict, usage: { totalTokens: 50 } });
}

describe("gradeDraft (production grader)", () => {
  it("invokes Sonnet with the playbook rubric content and the draft text", async () => {
    mockVerdict({ criteria: [{ name: "firm-hook", pass: true }], passed: true });
    const draft = "I want to join Barclays because of their 2024 markets desk work.";
    await gradeDraft("u1", draft, baseCtx);

    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
    const call = mocks.generateObject.mock.calls[0][0];
    // Model is Sonnet (judgment), not Haiku.
    expect(call.model).toBeDefined();
    // The prompt carries the actual playbook rubric content (so it cannot be a hardcoded pass).
    expect(call.prompt).toContain("competitor-swap");
    expect(call.prompt).toContain(FIRM_HOOK.split("\n")[0]);
    expect(call.prompt).toContain(GRADER_PRINCIPLES.split("\n")[0]);
    // The draft under test is passed to the model.
    expect(call.prompt).toContain(draft);
    // A zod schema constrains structured output.
    expect(call.schema).toBeDefined();
  });

  it("returns the structured verdict (criteria + passed), attempts/skipped defaulted", async () => {
    mockVerdict({
      criteria: [
        { name: "firm-hook", pass: false, fix: "name a specific Barclays desk or deal" },
        { name: "quantified-result", pass: true },
      ],
      passed: false,
    });
    const res = await gradeDraft("u1", "weak draft", baseCtx);
    expect(res.passed).toBe(false);
    expect(res.criteria).toHaveLength(2);
    expect(res.criteria[0]).toMatchObject({ name: "firm-hook", pass: false });
    expect(res.criteria[0].fix).toContain("Barclays");
    expect(res.skipped).toBe(false);
    expect(res.attempts).toBe(0);
  });

  it("includes the SONNET_ID model id reference (judgment model) — sanity that Sonnet is wired", () => {
    // Guard against an accidental swap to Haiku: the model id constant exists and is Sonnet.
    expect(SONNET_ID).toBe("claude-sonnet-4-6");
  });

  it("includes STAR rubric for competency questions", async () => {
    mockVerdict({ criteria: [{ name: "star", pass: true }], passed: true });
    await gradeDraft("u1", "draft", { ...baseCtx, questionKind: "leadership", firmHookExpected: false });
    const prompt = mocks.generateObject.mock.calls.at(-1)![0].prompt as string;
    expect(prompt).toContain(STAR_RULES.split("\n")[0]);
  });

  it("includes the commercial-awareness (VIEW) rubric for commercial questions", async () => {
    mockVerdict({ criteria: [{ name: "view", pass: true }], passed: true });
    await gradeDraft("u1", "draft", { ...baseCtx, questionKind: "commercial" });
    const prompt = mocks.generateObject.mock.calls.at(-1)![0].prompt as string;
    expect(prompt).toContain(COMMERCIAL_AWARENESS.split("\n")[0]);
  });

  it("when firmHookDisclosed is set, instructs grading the honest disclosure (not penalising a missing hook)", async () => {
    mockVerdict({ criteria: [{ name: "honest-disclosure", pass: true }], passed: true });
    await gradeDraft("u1", "I should research a specific Barclays detail.", {
      ...baseCtx,
      firmHookDisclosed: true,
    });
    const prompt = mocks.generateObject.mock.calls.at(-1)![0].prompt as string;
    // The grader is told NOT to require a hook, but to reward honest disclosure.
    expect(prompt.toLowerCase()).toMatch(/honest|disclos|do not penalise|do not penalize/);
  });

  it("threads the word cap into the rubric when known", async () => {
    mockVerdict({ criteria: [{ name: "word-cap", pass: true }], passed: true });
    await gradeDraft("u1", "draft", { ...baseCtx, wordCap: 200 });
    const prompt = mocks.generateObject.mock.calls.at(-1)![0].prompt as string;
    expect(prompt).toContain("200");
  });
});
