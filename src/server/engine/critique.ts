import { generateText } from "ai";
import { modelFor } from "@/server/ai/models";
import { recordUsage } from "@/server/ai/budget";
import { writingSkill } from "@/server/engine/skills";
import type { VoiceProfile } from "@/server/engine/types";

/**
 * Global AI-tells blacklist. Canonical source is the writing-craft skill in
 * src/server/engine/skills (so the draft prompt and this check never drift).
 * Em dash is character-checked separately below.
 */
export const GLOBAL_TELLS = writingSkill.bannedTells;

const NON_LITERAL_TELLS = new Set(["em dashes", "symmetric three-item lists"]);

/** Normalize curly/smart quotes to straight quotes for reliable matching. */
function normalizeCurlyQuotes(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

export function checkTells(text: string, userTells: string[]): string[] {
  const found: string[] = [];
  // Only flag em dash U+2014; en dash U+2013 is allowed (legitimate in ranges)
  if (/—/.test(text)) found.push("em dash");
  const normalized = normalizeCurlyQuotes(text).toLowerCase();
  for (const tell of GLOBAL_TELLS) {
    const normalizedTell = normalizeCurlyQuotes(tell).toLowerCase();
    if (normalized.includes(normalizedTell)) found.push(tell);
  }
  for (const tell of userTells) {
    if (NON_LITERAL_TELLS.has(tell.toLowerCase())) continue;
    const normalizedTell = normalizeCurlyQuotes(tell).toLowerCase();
    if (normalized.includes(normalizedTell)) found.push(tell);
  }
  return [...new Set(found)];
}

export async function critiqueAndRevise(
  userId: string,
  draft: string,
  voice: VoiceProfile,
): Promise<{ text: string; checksFailed: string[]; revised: boolean; residualTells: string[] }> {
  const failed = checkTells(draft, voice.bannedTells);
  if (!failed.length) return { text: draft, checksFailed: [], revised: false, residualTells: [] };

  const { text: revisedText, usage } = await generateText({
    model: modelFor("critique"),
    // Output cap (cost): the revision is a same-length rewrite of `draft`, never longer.
    // 1536 sits above the largest draft budget (the 1200-token cover-letter draft) with
    // margin, so it bounds a runaway generation while NEVER truncating a legitimate rewrite.
    // No prompt-cache breakpoint: this prompt is small and fully dynamic (the draft + the
    // specific tells found), with no large static prefix, and it runs on Haiku 4.5 whose
    // cache minimum is 4096 tokens — far above anything here.
    maxOutputTokens: 1536,
    prompt: `Rewrite this application-answer draft to remove the listed problems while keeping meaning, length, facts, and the writer's plain style. Do not add new claims. British English, contractions fine, no em dashes.

Problems found: ${failed.join("; ")}
${voice.traits.length ? `Writer's traits to preserve:\n${voice.traits.join("\n")}` : ""}

Draft:
${draft}

Return only the rewritten text.`,
  });
  recordUsage(userId, usage?.totalTokens ?? 0).catch(() => {});

  const revised = revisedText.trim();
  const stillFailing = checkTells(revised, voice.bannedTells);
  if (stillFailing.length >= failed.length) {
    return { text: draft, checksFailed: failed, revised: false, residualTells: failed };
  }
  return { text: revised, checksFailed: failed, revised: true, residualTells: stillFailing };
}
