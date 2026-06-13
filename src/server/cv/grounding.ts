// src/server/cv/grounding.ts
// Best-effort: never throws. Syncs BuiltCv.data → ApplyProfile.cvText
// and distils CV facts to profile.md memory.
import { prisma } from "@/server/db";
import { cvDataSchema, cvToPlainText } from "@/lib/cv";
import { extractCvFactsToMemory } from "@/server/cv/facts";

/**
 * Sync the user's built CV into grounding (ApplyProfile.cvText + profile.md).
 * Best-effort: swallows all errors — never blocks a save or a chat response.
 */
export async function syncCvGrounding(userId: string): Promise<void> {
  try {
    const row = await prisma.builtCv.findUnique({ where: { userId } });
    if (!row) return;

    const parsed = cvDataSchema.safeParse(row.data);
    if (!parsed.success) return;

    const text = cvToPlainText(parsed.data);
    if (!text.trim()) return;

    // Upsert ApplyProfile.cvText without touching file-upload fields.
    await prisma.applyProfile.upsert({
      where: { userId },
      create: { userId, cvText: text },
      update: { cvText: text },
    });

    // Distil facts into profile.md (also best-effort internally).
    await extractCvFactsToMemory(userId, text);
  } catch (err) {
    console.error("[cv grounding] sync failed:", err);
  }
}
