"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db";
import { recomputeMatchScores } from "../matching";
import { essentialsSchema } from "../../lib/validation";
import { syncProfileFactsToMemory } from "../memory/sync";

export interface OnboardingResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Completes onboarding from the mandatory essentials step alone. The optional
 * CV and questionnaire steps that follow are progressive enhancement — the
 * user is fully onboarded once this returns ok.
 */
export async function completeOnboarding(raw: unknown): Promise<OnboardingResult> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };

  const parsed = essentialsSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const d = parsed.data;
  const userId = session.user.id;

  const education = {
    university: d.university,
    degreeSubject: d.degreeSubject,
    degreeType: d.degreeType,
    graduationYear: d.graduationYear,
    currentYear: d.currentYear,
  };

  await prisma.$transaction([
    // Updates touch only essentials fields so a re-run never clobbers
    // questionnaire answers (workAuth, skills, gradeInfo, locations…).
    prisma.profile.upsert({
      where: { userId },
      update: education,
      create: { userId, ...education },
    }),
    prisma.preferences.upsert({
      where: { userId },
      update: { targetRoleFamilies: d.targetRoleFamilies },
      // Until the user answers locations we treat them as open to anywhere.
      create: { userId, targetRoleFamilies: d.targetRoleFamilies, openToAnywhereUk: true },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { onboardedAt: new Date() },
    }),
  ]);

  await syncProfileFactsToMemory(userId, "onboarding completed");
  await recomputeMatchScores(userId);
  revalidatePath("/tracker");

  return { ok: true };
}
