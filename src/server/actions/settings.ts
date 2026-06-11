"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db";
import { recomputeMatchScores } from "../matching";
import { settingsSchema } from "../../lib/validation";
import { syncProfileFactsToMemory } from "../memory/sync";

export interface SettingsResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function updateSettings(raw: unknown): Promise<SettingsResult> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };

  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const d = parsed.data;
  const userId = session.user.id;

  await prisma.$transaction([
    prisma.profile.update({
      where: { userId },
      data: {
        university: d.university,
        degreeSubject: d.degreeSubject,
        degreeType: d.degreeType,
        graduationYear: d.graduationYear,
        currentYear: d.currentYear,
      },
    }),
    prisma.preferences.update({
      where: { userId },
      data: { targetRoleFamilies: d.targetRoleFamilies },
    }),
  ]);

  await syncProfileFactsToMemory(userId, "settings updated");
  await recomputeMatchScores(userId);

  revalidatePath("/dashboard");
  revalidatePath("/saved");
  revalidatePath("/settings");

  return { ok: true };
}
