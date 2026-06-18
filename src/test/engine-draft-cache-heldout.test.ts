import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HELD-OUT adversarial review tests (independent of the author's). Two goals:
 *  (1) GOLDEN byte-for-byte: the joined two-message system equals the EXACT legacy
 *      single-string `body.replace("{{voice}}", voiceBlock) + "\n\n" + tailoring`.
 *      The author's cache test only uses toContain — this closes that gap with a
 *      full-string ===.
 *  (2) Grader-loop invariants under a stubbed grader: best-draft, fail-safe (grader
 *      throws -> ships pre-grader draft, never throws), and the <=2 Sonnet generateText
 *      cost bound after the 2->1 collapse.
 */
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  gradeDraft: vi.fn(),
}));
vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@/server/ai/budget", () => ({ recordUsage: vi.fn(async () => {}) }));
vi.mock("@/server/engine/grader", () => ({ gradeDraft: mocks.gradeDraft }));

import { draftText } from "@/server/engine/draft";
import { writingSkill } from "@/server/engine/skills";
import { REGISTER, DIVISION_EMPHASIS } from "@/server/engine/playbook";
import { inferRegister } from "@/server/engine/register";
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
  voice: {
    bannedTells: ["synergy"],
    traits: ["- Short openings"],
    exemplars: "> A real sentence I wrote.",
  },
  stories: [],
  companyNotes: "Spoke to an analyst on the markets desk.",
  research: "Barclays markets research detail.",
  pastAnswers: [],
};

function grade(passed: boolean, criteria: GradeResult["criteria"] = []): GradeResult {
  return { passed, criteria, attempts: 0, skipped: false };
}

/** Reproduce draft.ts voiceBlock EXACTLY (kept in lockstep; if it drifts the golden fails). */
function legacyVoiceBlock(ctx: DraftContext): string {
  const parts: string[] = [];
  if (ctx.voice.bannedTells.length)
    parts.push(`- this writer also never uses: ${ctx.voice.bannedTells.join(", ")}`);
  if (ctx.voice.traits.length) parts.push(`\nWriter's observed traits:\n${ctx.voice.traits.join("\n")}`);
  if (ctx.voice.exemplars)
    parts.push(
      `\nExamples of the writer's real writing (match the register, do NOT copy phrases):\n${ctx.voice.exemplars.slice(0, 1500)}`,
    );
  return parts.join("\n");
}

/** Reproduce draft.ts tailoringBlock EXACTLY for a motivation/why-firm ANSWER with grounding. */
function legacyTailoring(register: string, division: string): string {
  const parts: string[] = ["REGISTER + DIVISION TAILORING (apply to this answer):"];
  parts.push(REGISTER[register as keyof typeof REGISTER]);
  if (division !== "unknown") parts.push(DIVISION_EMPHASIS[division as keyof typeof DIVISION_EMPHASIS]);
  parts.push(
    "INDIVIDUAL WEAVE: tie every firm fact back to the applicant's own evidence (their CV, stories or profile). A fact about the firm only earns its place when it connects to what this applicant has done or wants to do. Listing firm facts without connecting any of them to yourself is a failure mode graders reject.",
  );
  // why-firm "Why Barclays?" => firmHookExpected true; research+notes present => disclosed false.
  parts.push(
    "FIRM HOOK — NEVER INVENT A CONTACT: do not invent a person, meeting, conversation or networking contact. Only cite a named contact that genuinely appears in the applicant's provided materials (their CV, stories or notes); inventing one is fabrication and an instant reject. Where no grounded contact exists, use a non-personal checkable hook (a named deal, a specific desk/group/programme, a fund or research piece) instead, or disclose honestly. This applies even when grounding exists.",
  );
  parts.push(
    "FIRM HOOK REQUIRED: weave in at least one specific, checkable firm hook (a named recent deal, a specific desk/group/programme, a named fund or research piece) that survives the competitor-swap test. Generic, swappable praise is a fail.",
  );
  return parts.join("\n\n");
}

beforeEach(() => {
  mocks.generateText.mockReset();
  mocks.gradeDraft.mockReset();
  mocks.generateText.mockResolvedValue({ text: "A clean honest answer.", usage: { totalTokens: 50 } });
});

describe("held-out: system byte-for-byte equals legacy single string", () => {
  it("joined two-message system === legacy body.replace(voice) + \\n\\n + tailoring (GOLDEN)", async () => {
    mocks.gradeDraft.mockResolvedValueOnce(grade(true));
    await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    const system = mocks.generateText.mock.calls[0][0].system as Array<{ content: string }>;
    const joined = system.map((m) => m.content).join("");

    const { programme, division } = inferRegister("", "Why Barclays?");
    const legacy =
      writingSkill.body.replace("{{voice}}", legacyVoiceBlock(CTX)) +
      "\n\n" +
      legacyTailoring(programme, division);

    expect(joined).toBe(legacy);
  });
});

describe("held-out: grader-loop invariants under the 2->1 cap", () => {
  it("fail-safe: grader THROWS -> ships the pre-grader draft, marks skipped, never throws", async () => {
    mocks.generateText.mockReset();
    mocks.generateText.mockResolvedValueOnce({ text: "PRE-GRADER DRAFT.", usage: { totalTokens: 9 } });
    mocks.gradeDraft.mockRejectedValueOnce(new Error("model down"));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    expect(out.text).toBe("PRE-GRADER DRAFT.");
    expect(out.provenance.gradeResult.skipped).toBe(true);
    // No revise fired (grader died before the loop): exactly one Sonnet generateText.
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("best-draft: a regressing single revise NEVER displaces a stronger initial draft", async () => {
    mocks.generateText.mockReset();
    mocks.generateText
      .mockResolvedValueOnce({ text: "STRONG INITIAL.", usage: { totalTokens: 9 } })
      .mockResolvedValueOnce({ text: "WORSE REVISION.", usage: { totalTokens: 9 } });
    mocks.gradeDraft
      .mockResolvedValueOnce(
        grade(false, [
          { name: "a", pass: true },
          { name: "b", pass: true },
          { name: "c", pass: false, fix: "x" },
        ]),
      )
      .mockResolvedValueOnce(grade(false, [{ name: "a", pass: true }]));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    expect(out.text).toBe("STRONG INITIAL.");
    expect(out.provenance.gradeResult.criteria.filter((c) => c.pass)).toHaveLength(2);
    expect(out.provenance.gradeResult.attempts).toBe(1);
  });

  it("cost bound: perpetual failure fires at most ONE revise (<=2 Sonnet generateText calls)", async () => {
    mocks.gradeDraft.mockResolvedValue(grade(false, [{ name: "x", pass: false, fix: "y" }]));
    await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });
    expect(mocks.generateText.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("a reachable single-revise improvement is NOT lost: a passing revision ships", async () => {
    mocks.generateText.mockReset();
    mocks.generateText
      .mockResolvedValueOnce({ text: "FAILING INITIAL.", usage: { totalTokens: 9 } })
      .mockResolvedValueOnce({ text: "PASSING REVISION.", usage: { totalTokens: 9 } });
    mocks.gradeDraft
      .mockResolvedValueOnce(grade(false, [{ name: "x", pass: false, fix: "y" }]))
      .mockResolvedValueOnce(grade(true, [{ name: "x", pass: true }]));

    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", employerName: "Barclays" });

    expect(out.text).toBe("PASSING REVISION.");
    expect(out.provenance.gradeResult.passed).toBe(true);
    expect(out.provenance.gradeResult.attempts).toBe(1);
  });
});
