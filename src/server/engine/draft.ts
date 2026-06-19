import { generateText, type SystemModelMessage } from "ai";
import { sonnet, SONNET_ID, ANTHROPIC_CACHE_BREAKPOINT } from "@/server/ai/models";
import { recordUsage } from "@/server/ai/budget";
import { classifyQuestion, selectStories, employerSlugOf } from "@/server/engine/stories";
import { critiqueAndRevise, checkTells } from "@/server/engine/critique";
import { writingSkill } from "@/server/engine/skills";
import { inferRegister } from "@/server/engine/register";
import { REGISTER, DIVISION_EMPHASIS } from "@/server/engine/playbook";
import { gradeDraft } from "@/server/engine/grader";
import type {
  DraftArgs,
  DraftContext,
  DraftResult,
  GradeContext,
  GradeResult,
} from "@/server/engine/types";

/**
 * Max grade→revise attempts. After this many failed grades we ship the best draft we have.
 *
 * Collapsed from 2 to 1 (cost): the grader loop already (a) always ships the BEST draft seen
 * and (b) has a fail-safe that ships the pre-grader draft if the grader throws, so a single
 * targeted revise captures the high-value fix while halving the worst-case Sonnet revise
 * calls. Both guarantees are unchanged and pinned in engine-grader-loop.test.ts. Quality is
 * unaffected: prompts, model and the draft's own output budget are identical.
 */
const MAX_GRADER_ATTEMPTS = 1;

/** Build a single targeted revise instruction from a verdict's failed criteria. */
function reviseInstructionFromVerdict(grade: GradeResult): string {
  const fixes = grade.criteria
    .filter((c) => !c.pass)
    .map((c) => `- ${c.name}: ${c.fix ?? "address this criterion"}`);
  return `A grader judged this draft against the UK-finance applications rubric and it did not pass. Revise it to fix ONLY the problems below, keeping everything that already works, the writer's plain style, the facts, and the length. Do NOT add new claims, invent firm details, or fabricate specifics to satisfy a criterion — an honest general sentence beats a fabricated specific.

Problems to fix:
${fixes.join("\n")}

Return only the revised answer text.`;
}

/**
 * Escape user-supplied content so it cannot prematurely close a <reference> XML tag.
 * Replaces `</reference` with `</ reference` (adds a space) so the closing tag
 * pattern is broken and cannot be used to inject instructions outside the reference block.
 * Case-insensitive, and tolerates whitespace after `</`.
 */
export function escapeReference(s: string): string {
  return s.replace(/<\/(\s*reference)/gi, "</ $1");
}

/**
 * Return true when the character sequence immediately before a period match looks
 * like an abbreviation that should NOT be treated as a sentence end.
 * Covers single uppercase initials (e.g. "J.P."), e.g., i.e., No., vs., etc.
 */
function isAbbreviationPeriod(text: string, matchIndex: number): boolean {
  // text[matchIndex] is the '.' (or '?' or '!')
  // Only '.' can be an abbreviation — '?' and '!' never are
  if (text[matchIndex] !== ".") return false;
  // Grab up to 10 chars before the period for pattern testing
  const before = text.slice(Math.max(0, matchIndex - 10), matchIndex);
  // Single uppercase letter: e.g. "J.P", "A", "B" just before the period
  if (/(?:^|[\s(])[A-Z]$/.test(before)) return true;
  // Another period two chars back (e.g. middle of "J.P.") — char at matchIndex-2 is '.'
  if (matchIndex >= 2 && text[matchIndex - 2] === ".") return true;
  // Common abbreviations ending before this period
  if (/\b(?:e\.g|i\.e|No|vs|etc)$/.test(before)) return true;
  return false;
}

/** Trim to charLimit at a sentence boundary (falls back to word boundary).
 *  Skips abbreviation periods (J.P., e.g., i.e., No., vs.) when locating sentence ends. */
export function trimToLimit(text: string, limit?: number): string {
  if (!limit || text.length <= limit) return text;
  const slice = text.slice(0, limit);
  // Search for the last sentence-ending punctuation (. ? !) before or at the slice boundary
  let lastSentence = -1;
  const sentenceRe = /[.?!](?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(slice)) !== null) {
    if (!isAbbreviationPeriod(slice, m.index)) {
      lastSentence = m.index;
    }
  }
  if (lastSentence > limit * 0.5) return slice.slice(0, lastSentence + 1).trim();
  const lastWord = slice.lastIndexOf(" ");
  return (lastWord > 0 ? slice.slice(0, lastWord) : slice).trim();
}

/** Per-user voice layer: substituted into the skill body's {{voice}} token. */
function voiceBlock(ctx: DraftContext): string {
  const parts: string[] = [];
  if (ctx.voice.bannedTells.length)
    parts.push(`- this writer also never uses: ${ctx.voice.bannedTells.join(", ")}`);
  if (ctx.voice.traits.length)
    parts.push(`\nWriter's observed traits:\n${ctx.voice.traits.join("\n")}`);
  if (ctx.voice.exemplars)
    parts.push(
      `\nExamples of the writer's real writing (match the register, do NOT copy phrases):\n${ctx.voice.exemplars.slice(0, 1500)}`,
    );
  return parts.join("\n");
}

/**
 * Tailoring block appended to the writing-skill system prompt: the inferred
 * REGISTER + DIVISION_EMPHASIS guidance (from the canonical playbook), the
 * individual-weave mandate, and — when a firm hook is expected but grounding is
 * thin — an explicit DISCLOSE-do-not-invent instruction. This carries the
 * applications expertise through to generation without weakening the
 * anti-fabrication hard rules already in the skill body.
 */
function tailoringBlock(opts: {
  register: ReturnType<typeof inferRegister>["programme"];
  division: ReturnType<typeof inferRegister>["division"];
  firmHookExpected: boolean;
  firmHookDisclosed: boolean;
}): string {
  const parts: string[] = ["REGISTER + DIVISION TAILORING (apply to this answer):"];
  parts.push(REGISTER[opts.register]);
  if (opts.division !== "unknown") parts.push(DIVISION_EMPHASIS[opts.division]);

  parts.push(
    "INDIVIDUAL WEAVE: tie every firm fact back to the applicant's own evidence (their CV, stories or profile). A fact about the firm only earns its place when it connects to what this applicant has done or wants to do. Listing firm facts without connecting any of them to yourself is a failure mode graders reject.",
  );

  if (opts.firmHookExpected) {
    parts.push(
      "FIRM HOOK — NEVER INVENT A CONTACT: do not invent a person, meeting, conversation or networking contact. Only cite a named contact that genuinely appears in the applicant's provided materials (their CV, stories or notes); inventing one is fabrication and an instant reject. Where no grounded contact exists, use a non-personal checkable hook (a named deal, a specific desk/group/programme, a fund or research piece) instead, or disclose honestly. This applies even when grounding exists.",
    );
  }
  if (opts.firmHookExpected && !opts.firmHookDisclosed) {
    parts.push(
      "FIRM HOOK REQUIRED: weave in at least one specific, checkable firm hook (a named recent deal, a specific desk/group/programme, a named fund or research piece) that survives the competitor-swap test. Generic, swappable praise is a fail.",
    );
  }
  if (opts.firmHookExpected && opts.firmHookDisclosed) {
    parts.push(
      "THIN FIRM GROUNDING: no concrete, checkable firm hook is available in the reference material for this why-firm/commercial question. Do NOT invent a deal, fund, person or initiative to fill the gap. Write honestly in general terms about genuine, defensible motivation, and where a specific hook is expected, be honest that the applicant should research one rather than fabricating it. An honest general sentence beats a fabricated specific, always.",
    );
  }
  return parts.join("\n\n");
}

/**
 * Build the draft system prompt as a TWO-message array so Anthropic prompt-caching can
 * cache the large static playbook/craft prefix and skip the per-request remainder.
 *
 * Message 0 (CACHED): `writingSkill.bodyStaticPrefix` — the byte-identical playbook/craft
 *   prefix. Nothing dynamic (voice, tailoring, references) precedes it, so the cached
 *   block is identical across the initial draft AND every revise call in the grader loop.
 * Message 1 (UNCACHED): the per-user voice block, the static body tail, then the
 *   per-request register/division/firm-hook tailoring.
 *
 * The concatenation `prefix + voice + suffix + "\n\n" + tailoring` reproduces the previous
 * single-string system EXACTLY (no inserted separators — Anthropic concatenates system text
 * blocks), so the model receives identical bytes and draft quality is unchanged. Only the
 * billing changes: the static prefix is written once and read cheaply thereafter.
 */
function buildSystem(
  ctx: DraftContext,
  tailoring: ReturnType<typeof tailoringBlock>,
): SystemModelMessage[] {
  const dynamicSuffix = `${voiceBlock(ctx)}${writingSkill.bodyStaticSuffix}\n\n${tailoring}`;
  return [
    {
      role: "system",
      content: writingSkill.bodyStaticPrefix,
      providerOptions: ANTHROPIC_CACHE_BREAKPOINT,
    },
    { role: "system", content: dynamicSuffix },
  ];
}

/** Build a profile line from only the non-empty fields. */
function buildProfileLine(ctx: DraftContext): string {
  const parts: string[] = [];
  if (ctx.profile.name) parts.push(ctx.profile.name);
  if (ctx.profile.university) parts.push(ctx.profile.university);
  if (ctx.profile.degree) parts.push(ctx.profile.degree);
  if (ctx.profile.graduationYear) parts.push(`graduating ${ctx.profile.graduationYear}`);
  if (ctx.profile.skills.length) parts.push(`Skills: ${ctx.profile.skills.join(", ")}`);
  return parts.join(", ");
}

export async function draftText(userId: string, ctx: DraftContext, args: DraftArgs): Promise<DraftResult> {
  const { kind: questionKind, themes } = classifyQuestion(args.question);

  // Register + division inferred from role/question TEXT (not the tracker column).
  const { programme: register, division } = inferRegister(args.roleTitle ?? "", args.question);

  // Firm-hook expectation: why-firm (motivation) and commercial questions, and every
  // cover letter (which must answer "why them"), must carry a specific, checkable hook.
  const firmHookExpected =
    args.kind === "COVER_LETTER" || questionKind === "motivation" || questionKind === "commercial";
  // A concrete hook is "available" when there is shared employer research OR the applicant's
  // own company notes to draw a checkable detail from. With neither, a hook would have to be
  // invented — so we DISCLOSE the gap instead of fabricating.
  const concreteHookAvailable = ctx.research !== null || ctx.companyNotes !== null;
  const firmHookDisclosed = firmHookExpected && !concreteHookAvailable;

  // Item 2: Employer-slug dedup — derive slug from name if not provided
  const slug = args.employerSlug ?? (args.employerName ? employerSlugOf(args.employerName) : undefined);
  const stories = selectStories(ctx.stories, {
    themes,
    employerSlug: slug,
    max: 2,
    excludeSlugs: args.excludeStories,
  });

  const parts: string[] = [];
  if (args.kind === "COVER_LETTER") {
    parts.push(
      `Write a cover letter (250-350 words, 3-4 short paragraphs: motivation, evidence, close; addressed to the hiring team) for ${args.roleTitle ?? "the role"} at ${args.employerName ?? "the firm"}.`,
    );
  } else {
    parts.push(`Application question${args.employerName ? ` for ${args.employerName}` : ""}${args.roleTitle ? ` (${args.roleTitle})` : ""}: ${args.question}`);
    if (args.charLimit) parts.push(`Hard limit: ${args.charLimit} characters. Aim under it.`);
  }

  // Thread the stated word cap (if any) into generation. The cap is hard: instruct the
  // model to obey it. This is the form's word limit, distinct from the charLimit trim.
  if (args.wordLimit) {
    parts.push(
      `Stated word cap: ${args.wordLimit} words. This is a hard limit; obey it exactly and do not exceed it. 70% of it with substance beats 100% with padding.`,
    );
  }

  // Item 11: Build profile from non-empty fields only
  const profileLine = buildProfileLine(ctx);
  if (profileLine) parts.push(`\nApplicant profile: ${profileLine}.`);

  // Item 1: Wrap reference material in delimiters + Item 10: Cap story body to 2000 chars
  if (ctx.profile.cvText) {
    parts.push(`<reference name="cv">\n${escapeReference(ctx.profile.cvText.slice(0, 4000))}\n</reference>`);
  }
  for (const s of stories) {
    const body = escapeReference((s.finalVersions || s.rawNotes).slice(0, 2000));
    parts.push(`<reference name="story:${s.slug}">\nReal story to ground the answer in ("${s.title}"):\nUse ONLY the details actually present in this story; do not embellish:\n${body}\n</reference>`);
  }
  if (ctx.companyNotes) {
    parts.push(`<reference name="company-notes">\nApplicant's own notes on this employer:\n${escapeReference(ctx.companyNotes.slice(0, 2000))}\n</reference>`);
  }
  if (ctx.research) {
    parts.push(`<reference name="research">\nEmployer research (use one specific, current detail if relevant):\n${escapeReference(ctx.research.slice(0, 3000))}\n</reference>`);
  }
  if (ctx.pastAnswers.length) {
    // Item 7: render hits with empty question as plain excerpts
    const renderedAnswers = ctx.pastAnswers
      .map((p) => (p.question ? `Q: ${p.question}\nA: ${escapeReference(p.excerpt)}` : escapeReference(p.excerpt)))
      .join("\n\n");
    parts.push(`<reference name="past-answers">\nThe applicant's past answers to similar questions (stay consistent, do not repeat verbatim):\n${renderedAnswers}\n</reference>`);
  }

  const maxOutputTokens =
    args.kind === "COVER_LETTER" ? 1200 : Math.min(1024, Math.floor((args.charLimit ?? 2048) / 2) + 256);
  const tailoring = tailoringBlock({ register, division, firmHookExpected, firmHookDisclosed });
  const system = buildSystem(ctx, tailoring);
  const prompt = parts.join("\n");

  const { text, usage } = await generateText({ model: sonnet, system, prompt, maxOutputTokens });
  recordUsage(userId, usage?.totalTokens ?? 0).catch(() => {});

  const trimmed = trimToLimit(text.trim(), args.charLimit);
  const critiqued = await critiqueAndRevise(userId, trimmed, ctx.voice);
  const preGrader = trimToLimit(critiqued.text, args.charLimit);

  // U3: quality-grader loop. Grade the draft against the playbook rubric; if it fails,
  // build a targeted revise instruction from the failed criteria and revise via the
  // existing draft-model path (NO new fabrication path), then re-grade. Capped at
  // MAX_GRADER_ATTEMPTS. Always returns the best draft. If the grader throws at any point
  // it is a FAIL-SAFE: we ship the pre-grader draft unchanged and flag the grade skipped.
  const gradeCtx: GradeContext = {
    question: args.question,
    questionKind,
    register,
    division,
    firmName: args.employerName,
    wordCap: args.wordLimit ?? null,
    firmHookDisclosed,
    firmHookExpected,
  };

  // Score a verdict so we can always keep the BEST draft seen: a passed verdict beats any
  // failing one; among failing verdicts, more passing criteria is better.
  const verdictScore = (g: GradeResult): number =>
    (g.passed ? 1000 : 0) + g.criteria.filter((c) => c.pass).length;

  let final = preGrader;
  let gradeResult: GradeResult;
  try {
    let grade = await gradeDraft(userId, final, gradeCtx);
    let attempts = 0;
    // Track the best draft + its verdict so a later (capped) revision never ships something
    // worse than an earlier one.
    let bestText = final;
    let bestGrade = grade;
    while (!grade.passed && attempts < MAX_GRADER_ATTEMPTS) {
      attempts += 1;
      const revisePrompt = reviseInstructionFromVerdict(grade);
      const { text: revisedText, usage: revUsage } = await generateText({
        model: sonnet,
        system,
        prompt: revisePrompt + "\n\nDraft:\n" + final,
        maxOutputTokens,
      });
      recordUsage(userId, revUsage?.totalTokens ?? 0).catch(() => {});
      const revised = trimToLimit(revisedText.trim(), args.charLimit);

      const reGrade = await gradeDraft(userId, revised, gradeCtx);
      final = revised;
      grade = reGrade;
      if (verdictScore(reGrade) >= verdictScore(bestGrade)) {
        bestText = revised;
        bestGrade = reGrade;
      }
    }
    // Always ship the best draft seen across attempts.
    final = bestText;
    gradeResult = { ...bestGrade, attempts, skipped: false };
  } catch {
    // Fail-safe: the grader is never allowed to block delivery. Ship the pre-grader draft.
    final = preGrader;
    gradeResult = { criteria: [], passed: false, attempts: 0, skipped: true };
  }

  // Item 3: Honest provenance — re-check tells on the final text
  const residualTells = checkTells(final, ctx.voice.bannedTells);

  // Thin grounding triggers (the draft DISCLOSES the gap rather than inventing):
  //  - a story-backed question with no stories selected;
  //  - a commercial question with no shared employer research (preserved original signal);
  //  - a why-firm/commercial question for which no concrete, checkable firm hook is
  //    available at all (firmHookDisclosed — also covers cover letters).
  const thinGrounding =
    (themes.length > 0 && stories.length === 0) ||
    (questionKind === "commercial" && ctx.research === null) ||
    firmHookDisclosed;

  return {
    text: final,
    provenance: {
      storiesUsed: stories.map((s) => s.slug),
      researchUsed: Boolean(ctx.research),
      pastAnswersUsed: ctx.pastAnswers.length,
      checksFailed: critiqued.checksFailed,
      revised: critiqued.revised,
      questionKind,
      model: SONNET_ID,
      residualTells,
      thinGrounding,
      register,
      division,
      wordCap: args.wordLimit ?? null,
      firmHookExpected,
      firmHookDisclosed,
      gradeResult,
    },
  };
}
