"use server";

import { auth } from "../auth";
import { prisma } from "../db";
import { aiConfigured } from "../ai/generate";
import { gatherSubstance } from "../engine/substance";
import { draftText } from "../engine/draft";
import { SONNET_ID } from "../ai/models";

export interface DraftResult {
  ok?: boolean;
  error?: string;
  content?: string;
}

/** Draft a cover letter for a known opportunity, grounded in the user's voice, stories, and CV. */
export async function draftCoverLetter(opportunityId: string): Promise<DraftResult> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };
  if (!aiConfigured()) return { error: "AI generation isn't configured on the server." };

  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: {
      title: true,
      employer: { select: { name: true } },
    },
  });
  if (!opp) return { error: "Opportunity not found." };

  const userId = session.user.id;
  try {
    const draftArgs = {
      kind: "COVER_LETTER" as const,
      question: `Cover letter for ${opp.title} at ${opp.employer.name}`,
      employerName: opp.employer.name,
      roleTitle: opp.title,
    };
    const ctx = await gatherSubstance(userId, draftArgs);
    const result = await draftText(userId, ctx, draftArgs);
    const content = result.text;

    await prisma.generatedDraft
      .create({
        data: {
          userId,
          opportunityId,
          kind: "COVER_LETTER",
          model: SONNET_ID,
          content,
          context: { employer: opp.employer.name, role: opp.title },
          provenance: JSON.stringify(result.provenance),
        },
      })
      .catch(() => {});

    return { ok: true, content };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Generation failed." };
  }
}
