"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db";
import { resolveAttentionByKey } from "../attention";

/**
 * Resolve one attention item (ownership-checked via updateMany so a foreign
 * id is indistinguishable from a missing one).
 */
export async function resolveAttention(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };

  const res = await prisma.attentionItem.updateMany({
    where: { id, userId: session.user.id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  if (res.count === 0) return { error: "Not found." };

  revalidatePath("/today");
  return { ok: true };
}

/** Form-action wrapper: a `<form action>` can't consume the {ok/error} return. */
export async function resolveAttentionForm(id: string): Promise<void> {
  await resolveAttention(id);
}

/**
 * Snooze one attention item until tomorrow morning. Target is 07:00
 * Europe/London; we approximate with 06:00 UTC (exact during BST, an hour
 * early during GMT winter — acceptable for a "see this again tomorrow" snooze).
 */
export async function snoozeAttention(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };

  const until = new Date();
  until.setUTCDate(until.getUTCDate() + 1);
  until.setUTCHours(6, 0, 0, 0);

  const res = await prisma.attentionItem.updateMany({
    where: { id, userId: session.user.id },
    data: { status: "SNOOZED", snoozedUntil: until },
  });
  if (res.count === 0) return { error: "Not found." };

  revalidatePath("/today");
  return { ok: true };
}

/** Form-action wrapper: a `<form action>` can't consume the {ok/error} return. */
export async function snoozeAttentionForm(id: string): Promise<void> {
  await snoozeAttention(id);
}

/**
 * Dismiss a gardener question (ownership-checked via updateMany). Also
 * resolves its mirrored attention item (`gq:<id>` — written by the overnight
 * cron) so Today's queue and Memory stay in step.
 */
export async function resolveGardenerQuestion(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };

  const res = await prisma.gardenerQuestion.updateMany({
    where: { id, userId: session.user.id },
    data: { status: "resolved" },
  });
  if (res.count === 0) return { error: "Not found." };

  await resolveAttentionByKey(session.user.id, `gq:${id}`);

  revalidatePath("/memory");
  revalidatePath("/today");
  return { ok: true };
}

/** Form-action wrapper: a `<form action>` can't consume the {ok/error} return. */
export async function resolveGardenerQuestionForm(id: string): Promise<void> {
  await resolveGardenerQuestion(id);
}
