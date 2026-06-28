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
import { persistCv, ensureCvChatSession } from "../cv/store";
import { seedCoachOpening, type CoachOpeningMessage } from "../cv/coach";
import type { CvData } from "../../lib/cv";

export interface ActionResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  cvParsed?: boolean;
  /** The parsed structured CV, present when cvParsed is true. Lets the /cv
   *  client switch from empty-state to the has-CV view in place (no full
   *  reload). Additive: the Settings caller ignores it. */
  cv?: CvData;
  /** F2: the seeded coach opening (assessment text + 3 chips) as a UIMessage,
   *  present when an uploaded CV parsed AND the opening was built. The /cv
   *  empty→has-CV transition feeds this into the chat's initialMessages so the
   *  coach opening + chips render IN PLACE immediately (no full reload / no
   *  refetch). Additive: the Settings caller ignores it. */
  coachOpening?: CoachOpeningMessage;
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

  // Run the two INDEPENDENT LLM calls concurrently rather than sequentially:
  //   - facts extraction (distil the CV into profile.md so Cyclops knows it)
  //   - structured parse (turn the CV into editable CvData; the SoT on /cv)
  // Facts extraction is best-effort and must NEVER abort the parse, so we use
  // Promise.allSettled — a rejected facts call leaves the parse result intact.
  let cvParsed = false;
  let parsedCv: CvData | undefined;
  if (cvText) {
    const [, parseResult] = await Promise.allSettled([
      extractCvFactsToMemory(userId, cvText),
      parseCvTextToCvData(userId, cvText),
    ]);

    if (parseResult.status === "fulfilled") {
      const cv = parseResult.value;
      if (cv) {
        try {
          // persistCv returns the validated CvData it saved; use that as the
          // source of truth for both the coach seed and the client return.
          parsedCv = await persistCv(userId, cv);
          cvParsed = true;
        } catch (err) {
          console.error("[cv store] parse-on-upload persist failed:", err);
        }
      }
    } else {
      console.error("[cv store] parse-on-upload failed:", parseResult.reason);
    }
  }

  // Seed the CV coach's grounded opening (assessment + 3 chips) so an UPLOADED
  // CV lands the user in a populated refine pane, identically to the draft path
  // (see actions/cv.ts). Best-effort: seedCoachOpening never throws/blocks.
  // F2: capture the returned opening message so the client can render it in
  // place immediately on the empty→has-CV transition (no full reload / refetch).
  let coachOpening: CoachOpeningMessage | undefined;
  if (parsedCv) {
    const sessionId = await ensureCvChatSession(userId);
    const seed = await seedCoachOpening({ userId, sessionId, cv: parsedCv });
    coachOpening = seed.message;
  }

  revalidatePath("/settings");
  revalidatePath("/cv");
  return {
    ok: true,
    cvParsed,
    ...(parsedCv ? { cv: parsedCv } : {}),
    ...(coachOpening ? { coachOpening } : {}),
  };
}

/** Remove the stored CV file + text. */
export async function clearCvAction(): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { error: "Your session has expired. Sign in again." };

  const existing = await prisma.applyProfile.findUnique({ where: { userId } });
  if (existing?.cvStoragePath) {
    try {
      await removeCv(existing.cvStoragePath);
    } catch (err) {
      console.error("[cv storage] failed to remove CV object:", err);
      return { error: "Could not remove your CV. Try again." };
    }
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
