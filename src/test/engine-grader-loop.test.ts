import { beforeEach, describe, expect, it, vi } from "vitest";

// Loop-mechanics tests for the U3 quality-grader loop wired into `draftText`.
//
// Here the GRADER is MOCKED (`@/server/engine/grader`) so we can script pass/fail
// sequences deterministically and assert the loop's control flow: revise-on-fail, the
// 2-attempt cap, the fail-safe on a grader throw, and the firmHookDisclosed pass-through.
// This is distinct from engine-grader.test.ts, which mocks the LLM (`generateObject`) and
// proves the REAL production `gradeDraft` calls Sonnet with the playbook rubric.
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  gradeDraft: vi.fn(),
}));
vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@/server/ai/budget", () => ({ recordUsage: vi.fn(async () => {}) }));
vi.mock("@/server/engine/grader", () => ({ gradeDraft: mocks.gradeDraft }));

import { draftText } from "@/server/engine/draft";
import type { DraftContext, GradeResult } from "@/server/engine/types";

const CTX: DraftContext = {
  profile: {
    name: "Eric",
    university: "LSE",
    degree: "Economics",
    graduationYear: 2027,
    skills: ["Excel"],
    cvText: "CV TEXT",
    workAuthStatement: null,
  },
  voice: { bannedTells: [], traits: [], exemplars: "" },
  stories: [],
  companyNotes: "Notes on the firm.",
  research: "Barclays markets desk research.",
  pastAnswers: [],
};

function grade(passed: boolean, criteria: GradeResult["criteria"] = []): GradeResult {
  return { passed, criteria, attempts: 0, skipped: false };
}

beforeEach(() => {
  mocks.generateText.mockReset();
  mocks.gradeDraft.mockReset();
  // Every generateText call (initial draft + any revise) returns clean, tell-free text so
  // critiqueAndRevise is a no-op and the loop's behaviour is governed solely by the grader.
  mocks.generateText.mockResolvedValue({ text: "A clean honest answer.", usage: { totalTokens: 50 } });
});

describe("draftText grader loop", () => {
  it("fail-then-pass: revises once, ships the passing draft, attempts = 1", async () => {
    mocks.gradeDraft
      .mockResolvedValueOnce(grade(false, [{ name: "firm-hook", pass: false, fix: "name a desk" }]))
      .mockResolvedValueOnce(grade(true, [{ name: "firm-hook", pass: true }]));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    expect(mocks.gradeDraft).toHaveBeenCalledTimes(2); // initial grade + one re-grade
    // One revise generateText beyond the initial draft generateText.
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(out.provenance.gradeResult.passed).toBe(true);
    expect(out.provenance.gradeResult.attempts).toBe(1);
    expect(out.provenance.gradeResult.skipped).toBe(false);
  });

  it("pass-first: no revision, attempts = 0, only the initial generateText runs", async () => {
    mocks.gradeDraft.mockResolvedValueOnce(grade(true, [{ name: "firm-hook", pass: true }]));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    expect(mocks.gradeDraft).toHaveBeenCalledTimes(1);
    expect(mocks.generateText).toHaveBeenCalledTimes(1); // initial draft only, no revise
    expect(out.provenance.gradeResult.passed).toBe(true);
    expect(out.provenance.gradeResult.attempts).toBe(0);
  });

  it("fail-twice-capped: stops at 2 attempts and still ships a draft", async () => {
    // Always fails — the cap, not a pass, must end the loop.
    mocks.gradeDraft.mockResolvedValue(grade(false, [{ name: "firm-hook", pass: false, fix: "name a desk" }]));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    // initial grade + 2 re-grades = 3 grader calls; capped at 2 revise attempts.
    expect(mocks.gradeDraft).toHaveBeenCalledTimes(3);
    expect(mocks.generateText).toHaveBeenCalledTimes(3); // initial + 2 revises
    expect(out.provenance.gradeResult.attempts).toBe(2);
    expect(out.provenance.gradeResult.passed).toBe(false);
    expect(out.provenance.gradeResult.skipped).toBe(false);
    expect(out.text).toBeTruthy(); // a draft is still delivered
  });

  it("grader-throws-fallback: ships the pre-grader draft, flags skipped, never blocks", async () => {
    mocks.gradeDraft.mockRejectedValueOnce(new Error("model unavailable"));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    expect(out.text).toBe("A clean honest answer."); // the pre-grader draft, unchanged
    expect(mocks.generateText).toHaveBeenCalledTimes(1); // no revise happened
    expect(out.provenance.gradeResult.skipped).toBe(true);
    expect(out.provenance.gradeResult.attempts).toBe(0);
  });

  it("firmHookDisclosed-not-penalised: passes the disclosed flag into the grade context", async () => {
    // Thin grounding: no research and no company notes for a why-firm question => disclosed.
    const thinCtx: DraftContext = { ...CTX, research: null, companyNotes: null };
    mocks.gradeDraft.mockResolvedValueOnce(grade(true, [{ name: "honest-disclosure", pass: true }]));

    const out = await draftText("u1", thinCtx, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    // The loop must hand the grader firmHookDisclosed=true so it grades the honest
    // disclosure instead of penalising a missing hook.
    const gradeCtxArg = mocks.gradeDraft.mock.calls[0][2];
    expect(gradeCtxArg.firmHookDisclosed).toBe(true);
    expect(gradeCtxArg.firmHookExpected).toBe(true);
    expect(out.provenance.firmHookDisclosed).toBe(true);
    expect(out.provenance.gradeResult.passed).toBe(true);
  });
});
