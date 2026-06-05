"use server";

import { auth } from "../auth";
import { prisma } from "../db";
import { loadApplicantContext } from "../ext-profile";
import { generateCoverLetter, aiConfigured } from "../ai/generate";

export interface DraftResult {
  ok?: boolean;
  error?: string;
  content?: string;
}

/** Draft a cover letter for a known opportunity, grounded in the user's CV. */
export async function draftCoverLetter(opportunityId: string): Promise<DraftResult> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };
  if (!aiConfigured()) return { error: "AI generation isn't configured on the server." };

  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: {
      title: true,
      descriptionSummary: true,
      employer: { select: { name: true } },
    },
  });
  if (!opp) return { error: "Opportunity not found." };

  const applicant = await loadApplicantContext(session.user.id);
  try {
    const content = await generateCoverLetter({
      employer: opp.employer.name,
      role: opp.title,
      roleSummary: opp.descriptionSummary,
      applicant,
    });

    await prisma.generatedDraft
      .create({
        data: {
          userId: session.user.id,
          opportunityId,
          kind: "COVER_LETTER",
          content,
          context: { employer: opp.employer.name, role: opp.title },
        },
      })
      .catch(() => {});

    return { ok: true, content };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Generation failed." };
  }
}
