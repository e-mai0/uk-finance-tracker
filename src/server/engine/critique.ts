import { generateText } from "ai";
import { haiku } from "@/server/ai/models";
import { recordUsage } from "@/server/ai/budget";
import type { VoiceProfile } from "@/server/engine/types";

/** Global AI-tells blacklist (spec §6 step 3). Em dash is character-checked. */
export const GLOBAL_TELLS = [
  "I'm excited",
  "I am excited",
  "proven track record",
  "delve",
  "tapestry",
  "underscore",
  "meticulous",
  "commendable",
  "passionate about",
  "leverage my",
  "in today's fast-paced",
  "it's not just",
];

const NON_LITERAL_TELLS = new Set(["em dashes", "symmetric three-item lists"]);

export function checkTells(text: string, userTells: string[]): string[] {
  const found: string[] = [];
  if (/[—–]/.test(text)) found.push("em dash");
  const lower = text.toLowerCase();
  for (const tell of GLOBAL_TELLS) {
    if (lower.includes(tell.toLowerCase())) found.push(tell);
  }
  for (const tell of userTells) {
    if (NON_LITERAL_TELLS.has(tell.toLowerCase())) continue;
    if (lower.includes(tell.toLowerCase())) found.push(tell);
  }
  return [...new Set(found)];
}

export async function critiqueAndRevise(
  userId: string,
  draft: string,
  voice: VoiceProfile,
): Promise<{ text: string; checksFailed: string[]; revised: boolean }> {
  const failed = checkTells(draft, voice.bannedTells);
  if (!failed.length) return { text: draft, checksFailed: [], revised: false };

  const { text: revisedText, usage } = await generateText({
    model: haiku,
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
    return { text: draft, checksFailed: failed, revised: false };
  }
  return { text: revised, checksFailed: failed, revised: true };
}
