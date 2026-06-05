"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db";
import { recomputeMatchScores } from "../matching";
import { onboardingSchema } from "../../lib/validation";

export interface OnboardingResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function completeOnboarding(raw: unknown): Promise<OnboardingResult> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const d = parsed.data;
  const userId = session.user.id;

  const gradeInfo =
    d.gradeInfo &&
    (d.gradeInfo.aLevels || d.gradeInfo.gcseSummary || d.gradeInfo.gpaOrEquivalent)
      ? d.gradeInfo
      : undefined;

  // The onboarding wizard captures a CV filename hint only (no bytes). The real
  // upload + parsing happens in Settings → Apply Profile, so we stash the hint
  // on ApplyProfile when present and prompt the user to finish uploading there.
  const cvHint = d.cvFileName
    ? { cvFileName: d.cvFileName, cvFileSize: d.cvFileSize ?? null }
    : null;

  await prisma.$transaction([
    prisma.profile.upsert({
      where: { userId },
      update: {
        university: d.university,
        degreeSubject: d.degreeSubject,
        degreeType: d.degreeType,
        graduationYear: d.graduationYear,
        currentYear: d.currentYear,
        workAuth: d.workAuth,
        skills: d.skills,
        gradeInfo: gradeInfo ?? undefined,
      },
      create: {
        userId,
        university: d.university,
        degreeSubject: d.degreeSubject,
        degreeType: d.degreeType,
        graduationYear: d.graduationYear,
        currentYear: d.currentYear,
        workAuth: d.workAuth,
        skills: d.skills,
        gradeInfo: gradeInfo ?? undefined,
      },
    }),
    ...(cvHint
      ? [
          prisma.applyProfile.upsert({
            where: { userId },
            update: cvHint,
            create: { userId, ...cvHint },
          }),
        ]
      : []),
    prisma.preferences.upsert({
      where: { userId },
      update: {
        targetRoleFamilies: d.targetRoleFamilies,
        preferredLocations: d.preferredLocations,
        openToAnywhereUk: d.openToAnywhereUk,
        targetEmployers: d.targetEmployers,
      },
      create: {
        userId,
        targetRoleFamilies: d.targetRoleFamilies,
        preferredLocations: d.preferredLocations,
        openToAnywhereUk: d.openToAnywhereUk,
        targetEmployers: d.targetEmployers,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { onboardedAt: new Date() },
    }),
  ]);

  await recomputeMatchScores(userId);
  revalidatePath("/dashboard");

  return { ok: true };
}
