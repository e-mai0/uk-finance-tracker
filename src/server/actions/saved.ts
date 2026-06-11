"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "../auth";
import { prisma } from "../db";
import { ensureEmployerResearch } from "@/server/engine/research";
import { checkBudget } from "@/server/ai/budget";

export async function toggleSave(
  opportunityId: string,
): Promise<{ saved: boolean }> {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  const userId = session.user.id;

  const existing = await prisma.savedOpportunity.findUnique({
    where: { userId_opportunityId: { userId, opportunityId } },
  });

  let saved: boolean;
  let employerIdForResearch: string | null = null;
  if (existing) {
    await prisma.savedOpportunity.delete({ where: { id: existing.id } });
    saved = false;
  } else {
    const opportunity = await prisma.savedOpportunity
      .create({ data: { userId, opportunityId } })
      .then(() =>
        prisma.opportunity.findUnique({
          where: { id: opportunityId },
          select: { employerId: true },
        }),
      );
    employerIdForResearch = opportunity?.employerId ?? null;
    saved = true;
  }

  // Trigger employer research warmup after a successful save (fire-and-forget via after())
  if (employerIdForResearch) {
    const capturedEmployerId = employerIdForResearch;
    const capturedUserId = userId;
    after(async () => {
      try {
        const { ok } = await checkBudget(capturedUserId);
        if (!ok) return;
        await ensureEmployerResearch(capturedEmployerId, capturedUserId);
      } catch (err) {
        console.error("research trigger failed", err);
      }
    });
  }

  revalidatePath("/tracker");
  revalidatePath("/saved");
  revalidatePath(`/opportunities/${opportunityId}`);
  return { saved };
}

export async function updateSavedNotes(
  opportunityId: string,
  notes: string,
): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  const userId = session.user.id;

  await prisma.savedOpportunity.upsert({
    where: { userId_opportunityId: { userId, opportunityId } },
    update: { notes: notes.trim() || null },
    create: { userId, opportunityId, notes: notes.trim() || null },
  });

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/saved");
  return { ok: true };
}
