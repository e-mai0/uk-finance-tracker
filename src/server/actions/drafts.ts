"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "../auth";
import { prisma } from "../db";
import { saveAnswerToBank } from "../answers";
import { resolveAttentionByKey } from "../attention";
import { maybeDistill } from "../engine/distill";

/**
 * Accept a generated draft (optionally edited) into the answer bank and
 * resolve its attention item. Mirrors the extension panel's explicit-save
 * path via the shared saveAnswerToBank helper.
 */
export async function acceptDraft(
  draftId: string,
  editedContent?: string,
): Promise<{ ok?: true; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };
  const userId = session.user.id;

  const draft = await prisma.generatedDraft.findFirst({
    where: { id: draftId, userId },
  });
  if (!draft) return { error: "Not found." };

  const ctx = (draft.context ?? {}) as { question?: unknown; employer?: unknown };
  const question =
    typeof ctx.question === "string" && ctx.question.trim()
      ? ctx.question
      : "(untitled answer)";
  const employer = typeof ctx.employer === "string" ? ctx.employer : null;

  const edited = editedContent?.trim();
  const answer = edited || draft.content;

  await saveAnswerToBank({ userId, questionText: question, answer, employer });

  // Capture the edit for learning, exactly like api/ext/answer's save path.
  if (edited && edited !== draft.content) {
    await prisma.draftEdit
      .create({
        data: { userId, draftId, original: draft.content, edited: answer },
      })
      .catch(() => {});
    after(() => maybeDistill(userId));
  }

  await resolveAttentionByKey(userId, `draft:${draftId}`);
  revalidatePath("/today");
  return { ok: true };
}

/**
 * Skip a draft: resolve its attention item only — the draft stays in
 * GeneratedDraft history, nothing is written to the answer bank.
 */
export async function skipDraft(
  draftId: string,
): Promise<{ ok?: true; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };
  const userId = session.user.id;

  const draft = await prisma.generatedDraft.findFirst({
    where: { id: draftId, userId },
    select: { id: true },
  });
  if (!draft) return { error: "Not found." };

  await resolveAttentionByKey(userId, `draft:${draftId}`);
  return { ok: true };
}
