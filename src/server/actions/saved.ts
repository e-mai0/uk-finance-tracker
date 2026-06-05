"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db";

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
  if (existing) {
    await prisma.savedOpportunity.delete({ where: { id: existing.id } });
    saved = false;
  } else {
    await prisma.savedOpportunity.create({ data: { userId, opportunityId } });
    saved = true;
  }

  revalidatePath("/dashboard");
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
