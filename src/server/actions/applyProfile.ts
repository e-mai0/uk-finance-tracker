"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db";
import { uploadCv, removeCv, storageConfigured } from "../storage";
import { extractCvText } from "../cv/parse";
import { normalizeQuestion } from "../../lib/answers";
import {
  applyProfileSchema,
  answerBankItemSchema,
} from "../../lib/validation";
import { extractCvFactsToMemory } from "../cv/facts";
import { parseCvTextToCvData } from "../cv/generate";
import { persistCv } from "../cv/store";

export interface ActionResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const MAX_CV_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_CV_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
]);

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** Save the reusable application profile fields (everything except the CV). */
export async function saveApplyProfile(raw: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { error: "Your session has expired. Sign in again." };

  const parsed = applyProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Normalize "" → null so empty fields don't autofill blanks.
  const d = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v]),
  );

  await prisma.applyProfile.upsert({
    where: { userId },
    create: { userId, ...d },
    update: d,
  });

  revalidatePath("/settings");
  return { ok: true };
}

/** Upload + parse a CV. Stores the file privately and the extracted text. */
export async function uploadCvAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { error: "Your session has expired. Sign in again." };

  if (!storageConfigured()) {
    return {
      error:
        "File storage isn't configured on the server (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    };
  }

  const file = formData.get("cv");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CV file to upload." };
  }
  if (file.size > MAX_CV_BYTES) {
    return { error: "That file is over 10 MB. Upload a smaller CV." };
  }
  if (file.type && !ALLOWED_CV_TYPES.has(file.type)) {
    return { error: "Upload a PDF, Word document, or plain-text CV." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const storagePath = await uploadCv(userId, file.name, bytes, contentType);
  const cvText = await extractCvText(bytes, file.name, contentType);

  await prisma.applyProfile.upsert({
    where: { userId },
    create: {
      userId,
      cvStoragePath: storagePath,
      cvFileName: file.name,
      cvFileSize: file.size,
      cvText: cvText || null,
      cvUpdatedAt: new Date(),
    },
    update: {
      cvStoragePath: storagePath,
      cvFileName: file.name,
      cvFileSize: file.size,
      cvText: cvText || null,
      cvUpdatedAt: new Date(),
    },
  });

  // Best-effort: distill the CV into profile.md facts so Cyclops knows it.
  if (cvText) await extractCvFactsToMemory(userId, cvText);

  // Best-effort: parse the uploaded CV into an editable structured CV so it
  // becomes the single source of truth on /cv. Failure leaves the upload intact.
  if (cvText) {
    try {
      const cv = await parseCvTextToCvData(userId, cvText);
      if (cv) await persistCv(userId, cv);
    } catch (err) {
      console.error("[cv store] parse-on-upload persist failed:", err);
    }
  }

  revalidatePath("/settings");
  revalidatePath("/cv");
  return { ok: true };
}

/** Remove the stored CV file + text. */
export async function clearCvAction(): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { error: "Your session has expired. Sign in again." };

  const existing = await prisma.applyProfile.findUnique({ where: { userId } });
  if (existing?.cvStoragePath) {
    await removeCv(existing.cvStoragePath).catch(() => {});
  }
  await prisma.applyProfile.update({
    where: { userId },
    data: {
      cvStoragePath: null,
      cvFileName: null,
      cvFileSize: null,
      cvText: null,
      cvUpdatedAt: null,
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

/** Create or update an answer-bank item. */
export async function saveAnswerBankItem(
  raw: unknown,
  id?: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { error: "Your session has expired. Sign in again." };

  const parsed = answerBankItemSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;
  const data = {
    questionText: d.questionText,
    questionNormalized: normalizeQuestion(d.questionText),
    answer: d.answer,
    tags: d.tags,
    employer: d.employer === "" ? null : d.employer,
  };

  if (id) {
    // Guard ownership: only update rows belonging to this user.
    const owned = await prisma.answerBankItem.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) return { error: "Answer not found." };
    await prisma.answerBankItem.update({ where: { id }, data });
  } else {
    await prisma.answerBankItem.create({ data: { userId, ...data } });
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteAnswerBankItem(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { error: "Your session has expired. Sign in again." };

  await prisma.answerBankItem.deleteMany({ where: { id, userId } });
  revalidatePath("/settings");
  return { ok: true };
}
