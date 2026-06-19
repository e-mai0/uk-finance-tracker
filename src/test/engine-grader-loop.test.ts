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

  it("fail-once-capped: stops at 1 attempt (cost collapse) and still ships a draft", async () => {
    // Always fails — the cap, not a pass, must end the loop. Cap is now ONE revise
    // (down from two) to halve worst-case Sonnet revise calls with no quality regression:
    // the best-draft and fail-safe guarantees below are unchanged.
    mocks.gradeDraft.mockResolvedValue(grade(false, [{ name: "firm-hook", pass: false, fix: "name a desk" }]));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    // initial grade + 1 re-grade = 2 grader calls; capped at 1 revise attempt.
    expect(mocks.gradeDraft).toHaveBeenCalledTimes(2);
    expect(mocks.generateText).toHaveBeenCalledTimes(2); // initial + 1 revise
    expect(out.provenance.gradeResult.attempts).toBe(1);
    expect(out.provenance.gradeResult.passed).toBe(false);
    expect(out.provenance.gradeResult.skipped).toBe(false);
    expect(out.text).toBeTruthy(); // a draft is still delivered
  });

  it("ships-best-draft: a regressing revision never displaces the earlier, better draft (guarantee survives the 1-attempt cap)", async () => {
    // Distinct texts per generateText call so we can prove WHICH draft ships, not just its
    // verdict. The INITIAL draft is the strongest (2 of 3 criteria pass, but still fails
    // overall); the single capped revision regresses to fewer passing criteria and keeps
    // failing, so the loop runs to the 1-attempt cap without ever beating the initial draft.
    mocks.generateText.mockReset();
    mocks.generateText
      .mockResolvedValueOnce({ text: "INITIAL best draft.", usage: { totalTokens: 50 } }) // initial draft
      .mockResolvedValue({ text: "REVISED worse draft.", usage: { totalTokens: 50 } }); // every revise

    const strong = grade(false, [
      { name: "firm-hook", pass: true },
      { name: "quantified-result", pass: true },
      { name: "i-voice", pass: false, fix: "use first person" },
    ]); // 2 passing, fails overall — the best draft seen
    const regressed = grade(false, [
      { name: "firm-hook", pass: true },
      { name: "quantified-result", pass: false, fix: "add a number" },
      { name: "i-voice", pass: false, fix: "use first person" },
    ]); // only 1 passing, still fails — strictly worse than `strong`

    mocks.gradeDraft
      .mockResolvedValueOnce(strong) // initial grade
      .mockResolvedValue(regressed); // every re-grade after a revision regresses

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    // initial grade + 1 re-grade = 2 grader calls (capped at 1 revise attempt, never passes).
    expect(mocks.gradeDraft).toHaveBeenCalledTimes(2);
    expect(mocks.generateText).toHaveBeenCalledTimes(2); // initial + 1 revise
    // The BEST draft (the INITIAL one, 2 criteria passing) must ship — NOT the later, worse
    // revision text that the loop ended on.
    expect(out.text).toBe("INITIAL best draft.");
    // The shipped verdict is the best one seen (2 passing criteria), not the last (1 passing).
    expect(out.provenance.gradeResult.criteria.filter((c) => c.pass)).toHaveLength(2);
    expect(out.provenance.gradeResult.passed).toBe(false);
    expect(out.provenance.gradeResult.attempts).toBe(1);
    expect(out.provenance.gradeResult.skipped).toBe(false);
  });

  it("cost-cap: the worst case fires at most ONE revise beyond the initial draft (<= 2 Sonnet generateText calls)", async () => {
    // Even on perpetual failure, the loop must not exceed one revise (the collapsed cap).
    mocks.gradeDraft.mockResolvedValue(grade(false, [{ name: "firm-hook", pass: false, fix: "x" }]));

    await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    // Hard upper bound on Sonnet generateText calls in draft.ts: initial draft + 1 revise.
    expect(mocks.generateText.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("best-draft survives even when the SINGLE revise improves: the passing revision ships", async () => {
    // The cap collapse must not cost a real improvement that's reachable in one revise.
    mocks.generateText.mockReset();
    mocks.generateText
      .mockResolvedValueOnce({ text: "INITIAL failing draft.", usage: { totalTokens: 50 } })
      .mockResolvedValueOnce({ text: "REVISED passing draft.", usage: { totalTokens: 50 } });
    mocks.gradeDraft
      .mockResolvedValueOnce(grade(false, [{ name: "firm-hook", pass: false, fix: "name a desk" }]))
      .mockResolvedValueOnce(grade(true, [{ name: "firm-hook", pass: true }]));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    expect(out.text).toBe("REVISED passing draft.");
    expect(out.provenance.gradeResult.passed).toBe(true);
    expect(out.provenance.gradeResult.attempts).toBe(1);
  });

  it("grader-throws-fallback: ships the pre-grader draft, flags skipped, never blocks", async () => {
    mocks.gradeDraft.mockRejectedValueOnce(new Error("model unavailable"));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    expect(out.text).toBe("A clean honest answer."); // the pre-grader draft, unchanged
    expect(mocks.generateText).toHaveBeenCalledTimes(1); // no revise happened
    expect(out.provenance.gradeResult.skipped).toBe(true);
    expect(out.provenance.gradeResult.attempts).toBe(0);
  });

  it("grounding-guard: an ungrounded experiential claim triggers a revise-or-disclose even when the grader passes", async () => {
    // The grader PASSES on both grades, so without the deterministic guard NO revise would
    // fire. The draft contains a fabricated event ("I attended a Citi careers panel") that is
    // absent from the corpus (CTX has CV "CV TEXT", notes, research — none mention a Citi panel),
    // so the guard must force one revise carrying the revise-or-disclose instruction.
    mocks.generateText.mockReset();
    mocks.generateText
      .mockResolvedValueOnce({ text: "I attended a Citi careers panel last week.", usage: { totalTokens: 50 } })
      .mockResolvedValueOnce({ text: "I read about Citi's recent advisory work and admire it.", usage: { totalTokens: 50 } });
    mocks.gradeDraft.mockResolvedValue(grade(true, [{ name: "firm-hook", pass: true }]));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "How have you engaged with us?", employerName: "Citi" });

    // A revise fired (initial + one revise) despite a passing grade.
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    // The revise instruction is REVISE-OR-DISCLOSE (do not silent-delete).
    const revisePrompt = mocks.generateText.mock.calls[1][0].prompt as string;
    const lc = revisePrompt.toLowerCase();
    expect(lc).toMatch(/attending an event|speaking to|meeting/);
    expect(lc).toMatch(/do not delete|honest|genuine/);
    // Provenance carries the ungrounded claims found.
    expect(out.provenance.ungroundedClaims).toBeDefined();
    expect(Array.isArray(out.provenance.ungroundedClaims)).toBe(true);
    // After the revise the corrected (reportative) draft ships clean.
    expect(out.text).toBe("I read about Citi's recent advisory work and admire it.");
  });

  it("grounding-guard: a clean (grounded/reportative) draft fires NO extra revise", async () => {
    mocks.generateText.mockReset();
    // Reportative phrasing only — the guard finds nothing; the grader passes => no revise.
    mocks.generateText.mockResolvedValue({
      text: "I read about Barclays' markets work and admire their discipline.",
      usage: { totalTokens: 50 },
    });
    mocks.gradeDraft.mockResolvedValueOnce(grade(true, [{ name: "firm-hook", pass: true }]));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    expect(mocks.generateText).toHaveBeenCalledTimes(1); // initial draft only, no revise
    expect(out.provenance.ungroundedClaims).toEqual([]);
    expect(out.provenance.gradeResult.attempts).toBe(0);
  });

  it("grounding-guard: a GROUNDED experience (entity in corpus) is NOT flagged and fires no revise", async () => {
    mocks.generateText.mockReset();
    // The claim names a real BlackRock spring week; CTX.profile.cvText must contain it.
    const groundedCtx: DraftContext = {
      ...CTX,
      profile: { ...CTX.profile, cvText: "Eric did a BlackRock spring week in 2024 with the index team." },
    };
    mocks.generateText.mockResolvedValue({
      text: "During my BlackRock spring week I shadowed the index team.",
      usage: { totalTokens: 50 },
    });
    mocks.gradeDraft.mockResolvedValueOnce(grade(true, [{ name: "firm-hook", pass: true }]));

    const out = await draftText("u1", groundedCtx, { kind: "ANSWER", question: "Why BlackRock?", employerName: "BlackRock" });

    expect(mocks.generateText).toHaveBeenCalledTimes(1); // no revise — the experience is grounded
    expect(out.provenance.ungroundedClaims).toEqual([]);
  });

  it("grounding-guard: respects the attempt cap — at most ONE revise even with an ungrounded claim that persists", async () => {
    mocks.generateText.mockReset();
    // Both drafts contain the same ungrounded claim, so the guard would want to revise again,
    // but the 1-attempt cap (#54) must hold.
    mocks.generateText.mockResolvedValue({
      text: "I attended a Citi careers panel last week.",
      usage: { totalTokens: 50 },
    });
    mocks.gradeDraft.mockResolvedValue(grade(true, [{ name: "firm-hook", pass: true }]));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "How have you engaged with us?", employerName: "Citi" });

    // initial + at most one revise — the attempt cap is unchanged.
    expect(mocks.generateText.mock.calls.length).toBeLessThanOrEqual(2);
    expect(out.text).toBeTruthy();
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
