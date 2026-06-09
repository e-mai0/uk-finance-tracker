import { generateText } from "ai";
import { sonnet } from "@/server/ai/models";
import { recordUsage } from "@/server/ai/budget";
import { classifyQuestion, selectStories } from "@/server/engine/stories";
import { critiqueAndRevise, GLOBAL_TELLS } from "@/server/engine/critique";
import type { DraftArgs, DraftContext, DraftResult } from "@/server/engine/types";

/** Trim to charLimit at a sentence boundary (falls back to word boundary). */
export function trimToLimit(text: string, limit?: number): string {
  if (!limit || text.length <= limit) return text;
  const slice = text.slice(0, limit);
  const lastSentence = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"), slice.endsWith(".") ? slice.length - 1 : -1);
  if (lastSentence > limit * 0.5) return slice.slice(0, lastSentence + 1).trim();
  const lastWord = slice.lastIndexOf(" ");
  return (lastWord > 0 ? slice.slice(0, lastWord) : slice).trim();
}

function buildSystem(ctx: DraftContext): string {
  return `You ghost-write job-application text in the applicant's own voice. UK finance context, British English.

Hard rules:
- never invent facts, names, numbers, or experiences; only use what is provided
- no em dashes; contractions are fine; vary sentence length
- one concrete detail per paragraph minimum; no generic filler
- never use: ${GLOBAL_TELLS.join(", ")}
${ctx.voice.bannedTells.length ? `- this writer also never uses: ${ctx.voice.bannedTells.join(", ")}` : ""}
${ctx.voice.traits.length ? `\nWriter's observed traits:\n${ctx.voice.traits.join("\n")}` : ""}
${ctx.voice.exemplars ? `\nExamples of the writer's real writing (match the register, do NOT copy phrases):\n${ctx.voice.exemplars}` : ""}

Return only the final text, no preamble.`;
}

export async function draftText(userId: string, ctx: DraftContext, args: DraftArgs): Promise<DraftResult> {
  const { kind: questionKind, themes } = classifyQuestion(args.question);
  const stories = selectStories(ctx.stories, { themes, employerSlug: args.employerSlug, max: 2 });

  const parts: string[] = [];
  if (args.kind === "COVER_LETTER") {
    parts.push(
      `Write a cover letter (250-350 words, 3-4 short paragraphs: motivation, evidence, close; addressed to the hiring team) for ${args.roleTitle ?? "the role"} at ${args.employerName ?? "the firm"}.`,
    );
  } else {
    parts.push(`Application question${args.employerName ? ` for ${args.employerName}` : ""}${args.roleTitle ? ` (${args.roleTitle})` : ""}: ${args.question}`);
    if (args.charLimit) parts.push(`Hard limit: ${args.charLimit} characters. Aim under it.`);
  }
  parts.push(`\nApplicant profile: ${ctx.profile.name ?? ""}, ${ctx.profile.university ?? ""}, ${ctx.profile.degree ?? ""}, graduating ${ctx.profile.graduationYear ?? "?"}. Skills: ${ctx.profile.skills.join(", ")}.`);
  if (ctx.profile.cvText) parts.push(`CV:\n${ctx.profile.cvText.slice(0, 4000)}`);
  for (const s of stories) {
    parts.push(`\nReal story to ground the answer in ("${s.title}"):\n${s.finalVersions || s.rawNotes}`);
  }
  if (ctx.companyNotes) parts.push(`\nApplicant's own notes on this employer:\n${ctx.companyNotes.slice(0, 2000)}`);
  if (ctx.research) parts.push(`\nEmployer research (use one specific, current detail if relevant):\n${ctx.research.slice(0, 3000)}`);
  if (ctx.pastAnswers.length) {
    parts.push(`\nThe applicant's past answers to similar questions (stay consistent, do not repeat verbatim):\n${ctx.pastAnswers.map((p) => `Q: ${p.question}\nA: ${p.excerpt}`).join("\n\n")}`);
  }

  const { text, usage } = await generateText({
    model: sonnet,
    system: buildSystem(ctx),
    prompt: parts.join("\n"),
    maxOutputTokens: args.kind === "COVER_LETTER" ? 1200 : Math.min(1024, Math.floor((args.charLimit ?? 2048) / 2) + 256),
  });
  recordUsage(userId, usage?.totalTokens ?? 0).catch(() => {});

  const trimmed = trimToLimit(text.trim(), args.charLimit);
  const critiqued = await critiqueAndRevise(userId, trimmed, ctx.voice);
  const final = trimToLimit(critiqued.text, args.charLimit);

  return {
    text: final,
    provenance: {
      storiesUsed: stories.map((s) => s.slug),
      researchUsed: Boolean(ctx.research),
      pastAnswersUsed: ctx.pastAnswers.length,
      checksFailed: critiqued.checksFailed,
      revised: critiqued.revised,
      questionKind,
    },
  };
}
