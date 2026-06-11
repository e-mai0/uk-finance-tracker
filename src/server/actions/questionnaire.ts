"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db";
import { recomputeMatchScores } from "../matching";
import { questionnaireSchema } from "../../lib/validation";
import { syncProfileFactsToMemory } from "../memory/sync";

export interface QuestionnaireResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Saves the optional questionnaire (wizard step 3 and the Settings page).
 * Every field is optional; only Profile/Preferences columns owned by the
 * questionnaire are written, so essentials are never touched.
 */
export async function saveQuestionnaire(raw: unknown): Promise<QuestionnaireResult> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };

  const parsed = questionnaireSchema.safeParse(raw);
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

  try {
    await prisma.$transaction([
      prisma.profile.update({
        where: { userId },
        data: {
          // Never null out an existing answer just because the field was left blank.
          ...(d.workAuth ? { workAuth: d.workAuth } : {}),
          skills: d.skills,
          gradeInfo: gradeInfo ?? undefined,
        },
      }),
      prisma.preferences.update({
        where: { userId },
        data: {
          preferredLocations: d.preferredLocations,
          openToAnywhereUk: d.openToAnywhereUk,
          targetEmployers: d.targetEmployers,
        },
      }),
    ]);
  } catch {
    // Profile/Preferences rows are created by completeOnboarding; missing rows
    // mean the user somehow skipped it.
    return { error: "Complete onboarding before saving the questionnaire." };
  }

  await syncProfileFactsToMemory(userId, "questionnaire updated");
  await recomputeMatchScores(userId);
  revalidatePath("/dashboard");
  revalidatePath("/saved");
  revalidatePath("/settings");

  return { ok: true };
}
