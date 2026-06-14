import { generateText } from "ai";
import { sonnet, SONNET_ID } from "@/server/ai/models";
import { recordUsage } from "@/server/ai/budget";
import { classifyQuestion, selectStories, employerSlugOf } from "@/server/engine/stories";
import { critiqueAndRevise, checkTells } from "@/server/engine/critique";
import { writingSkill } from "@/server/engine/skills";
import type { DraftArgs, DraftContext, DraftResult } from "@/server/engine/types";

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

function buildSystem(ctx: DraftContext): string {
  return writingSkill.body.replace("{{voice}}", voiceBlock(ctx));
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
  const system = buildSystem(ctx);
  const prompt = parts.join("\n");

  const { text, usage } = await generateText({ model: sonnet, system, prompt, maxOutputTokens });
  recordUsage(userId, usage?.totalTokens ?? 0).catch(() => {});

  const trimmed = trimToLimit(text.trim(), args.charLimit);
  const critiqued = await critiqueAndRevise(userId, trimmed, ctx.voice);
  const final = trimToLimit(critiqued.text, args.charLimit);

  // Item 3: Honest provenance — re-check tells on the final text
  const residualTells = checkTells(final, ctx.voice.bannedTells);

  // Thin grounding: story-backed question with no stories selected, or commercial question with no research
  const thinGrounding =
    (themes.length > 0 && stories.length === 0) ||
    (questionKind === "commercial" && ctx.research === null);

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
    },
  };
}
