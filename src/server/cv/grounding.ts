// src/server/cv/grounding.ts
import "server-only";
import { prisma } from "@/server/db";
import { cvToPlainText } from "@/lib/cv";
import { getBuiltCv } from "@/server/cv/store";
import { extractCvFactsToMemory } from "@/server/cv/facts";

/**
 * Best-effort: serialise the built CV to plain text, set it as the grounding
 * text (ApplyProfile.cvText) and refresh profile.md facts. Never throws.
 * Leaves any uploaded CV file record (cvStoragePath/cvFileName) untouched.
 */
export async function syncCvGrounding(userId: string): Promise<void> {
  try {
    const built = await getBuiltCv(userId);
    if (!built) return;
    const text = cvToPlainText(built.cv);
    if (!text) return;

    await prisma.applyProfile.upsert({
      where: { userId },
      create: { userId, cvText: text, cvUpdatedAt: new Date() },
      update: { cvText: text, cvUpdatedAt: new Date() },
    });

    await extractCvFactsToMemory(userId, text);
  } catch (err) {
    console.error("[cv grounding] sync failed:", err);
  }
}
