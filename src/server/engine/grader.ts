import { generateObject } from "ai";
import { z } from "zod";
import { modelFor } from "@/server/ai/models";
import { recordUsage } from "@/server/ai/budget";
import {
  FIRM_HOOK,
  STAR_RULES,
  COMMERCIAL_AWARENESS,
  UK_NORMS,
  GRADER_PRINCIPLES,
} from "@/server/engine/playbook";
import type { GradeContext, GradeResult } from "@/server/engine/types";

/**
 * grader.ts - the U3 quality grader. A separate Sonnet pass that judges a finished
 * draft against the canonical playbook rubric and returns a structured, per-criterion
 * verdict (pass/fail + a targeted fix for each failure). The draft loop in draft.ts
 * consumes this verdict to decide whether to revise.
 *
 * It is JUDGMENT, not generation, so it runs on Sonnet (not Haiku). It introduces no
 * new fabrication path: it only marks a draft pass/fail and suggests fixes; revision
 * still goes through the existing draft-model path.
 *
 * Deterministically testable: it calls `generateObject` from "ai" exactly the way the
 * other engine modules do, so tests mock that one function with no network.
 */

/** Structured output the model must return: one verdict per applicable criterion. */
const VerdictSchema = z.object({
  criteria: z
    .array(
      z.object({
        /** Stable criterion key, e.g. "firm-hook", "quantified-result", "i-voice". */
        name: z.string(),
        /** True when the draft satisfies this criterion. */
        pass: z.boolean(),
        /** When pass is false: a short, targeted instruction for how to fix it. */
        fix: z.string().optional(),
      }),
    )
    .max(12),
  /** True only when every applicable criterion passed. */
  passed: z.boolean(),
});

/**
 * Assemble the rubric the grader applies, selecting the right playbook blocks for the
 * question kind. The FIRM_HOOK + GRADER_PRINCIPLES blocks always apply; STAR applies to
 * competency questions; commercial-awareness (VIEW) applies to commercial questions.
 */
function buildRubric(ctx: GradeContext): string {
  const blocks: string[] = [FIRM_HOOK];

  // Competency questions (leadership, teamwork, "tell me about a time", etc.) get STAR.
  const isCompetency = /leadership|teamwork|competency|challenge|conflict|failure|strength/i.test(
    ctx.questionKind,
  );
  if (isCompetency) blocks.push(STAR_RULES);

  // Commercial / deal / markets questions get the VIEW rubric.
  if (ctx.questionKind === "commercial") blocks.push(COMMERCIAL_AWARENESS);

  blocks.push(UK_NORMS, GRADER_PRINCIPLES);
  return blocks.join("\n\n");
}

/**
 * gradeDraft - run one grading pass. Returns the structured verdict with `attempts` and
 * `skipped` defaulted (0 / false); the loop in draft.ts owns the attempt counter and the
 * skipped flag for the fail-safe path.
 */
export async function gradeDraft(
  userId: string,
  draft: string,
  ctx: GradeContext,
): Promise<GradeResult> {
  const rubric = buildRubric(ctx);

  // Firm-hook handling: when grounding was thin and the draft HONESTLY DISCLOSED the gap
  // (firmHookDisclosed), do NOT penalise the missing hook — grade the honest disclosure
  // instead. When a hook IS expected and grounding was not thin, require it.
  let firmHookClause: string;
  if (ctx.firmHookDisclosed) {
    firmHookClause = `FIRM HOOK — HONEST DISCLOSURE MODE: grounding for this why-firm/commercial question was thin, so the draft was permitted to disclose honestly that the applicant should research a specific firm detail rather than fabricate one. DO NOT penalise the absence of a specific firm hook here. Instead, grade the honest disclosure: it passes if the draft is honest about the gap and offers genuine, defensible motivation without inventing a deal, fund, person or initiative. Penalise ONLY fabrication or empty filler, never the honesty itself.`;
  } else if (ctx.firmHookExpected) {
    firmHookClause = `FIRM HOOK REQUIRED: this question demands at least one specific, checkable firm hook (a named recent deal, a specific desk/group/programme, a named fund or research piece) that survives the competitor-swap test. A generic, swappable "why them" fails the firm-hook criterion. A vague or clearly-generic personal-meeting claim ("I met someone from the firm at a campus event") does NOT by itself satisfy the firm-hook criterion: you cannot verify a person from the text, so a strong hook is a checkable deal/desk/programme/fund/research specific OR a genuinely concrete, grounded contact. Do NOT reject a concrete grounded contact, but do NOT treat a vague "I met someone" as automatically checkable.`;
  } else {
    firmHookClause = `FIRM HOOK: not required for this question kind; do not invent a firm-hook criterion failure if none is expected.`;
  }

  const wordCapClause = ctx.wordCap
    ? `WORD CAP: the form states a hard cap of ${ctx.wordCap} words. Fail the "word-cap" criterion if the draft clearly exceeds it; 70% of the cap with substance is fine.`
    : `WORD CAP: no stated cap; do not grade length against a number.`;

  const prompt = `You are a senior UK-finance applications grader. Judge the DRAFT below against the rubric. Apply the competitor-swap test ruthlessly. For each applicable criterion, return pass/fail and, when it fails, a short targeted fix the writer can act on. Set "passed" true ONLY if every applicable criterion passes.

QUESTION (kind: ${ctx.questionKind}, register: ${ctx.register}, division: ${ctx.division}${ctx.firmName ? `, firm: ${ctx.firmName}` : ""}):
${ctx.question}

${firmHookClause}

${wordCapClause}

RUBRIC (the canonical playbook standards — grade strictly against these):
${rubric}

DRAFT TO GRADE:
${draft}`;

  // No prompt-cache breakpoint here (deliberate): the rubric is NOT a byte-identical static
  // prefix. STAR/COMMERCIAL blocks are inserted into the MIDDLE of the rubric per question
  // kind, and the dynamic firm-hook/word-cap clauses + question + draft are interleaved, so
  // there is no large stable prefix to cache. Caching only the ~70-token grader role
  // preamble would fall below Sonnet's 1024-token cache minimum and never hit.
  //
  // Output cap (cost): the verdict is a small structured object — at most 12 short criteria,
  // each a key, a boolean and a brief fix. 1024 tokens is generous headroom while bounding a
  // runaway generation that would otherwise bill against the (uncapped) default.
  const { object, usage } = await generateObject({
    model: modelFor("grader"),
    schema: VerdictSchema,
    prompt,
    maxOutputTokens: 1024,
  });
  recordUsage(userId, usage?.totalTokens ?? 0).catch(() => {});

  return {
    criteria: object.criteria,
    passed: object.passed,
    attempts: 0,
    skipped: false,
  };
}
