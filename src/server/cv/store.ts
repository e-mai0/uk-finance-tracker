// src/server/cv/store.ts
import { prisma } from "@/server/db";
import { cvDataSchema, cvFormInputSchema, type CvData, type CvFormInput } from "@/lib/cv";

/** Upsert the user's built CV. Validates the data before persisting.
 *  Returns the parsed CvData that was saved. */
export async function persistCv(userId: string, cv: CvData, formInput?: unknown): Promise<CvData> {
  const data = cvDataSchema.parse(cv);
  await prisma.builtCv.upsert({
    where: { userId },
    create: { userId, data: data as object, formInput: formInput as object | undefined },
    update: { data: data as object, ...(formInput !== undefined ? { formInput: formInput as object } : {}) },
  });
  return data;
}

/** Read the user's built CV, or null if they haven't built one yet. */
export async function getBuiltCv(
  userId: string,
): Promise<{ cv: CvData; formInput: CvFormInput | null; chatSessionId: string | null } | null> {
  const row = await prisma.builtCv.findUnique({ where: { userId } });
  if (!row) return null;
  const result = cvDataSchema.safeParse(row.data);
  if (!result.success) return null;
  const formInputResult = cvFormInputSchema.safeParse(row.formInput);
  return {
    cv: result.data,
    formInput: formInputResult.success ? formInputResult.data : null,
    chatSessionId: row.chatSessionId ?? null,
  };
}

/** Get or create the dedicated "cv-builder" ChatSession for this user,
 *  storing its id on BuiltCv.chatSessionId. */
export async function ensureCvChatSession(userId: string): Promise<string> {
  const existing = await prisma.builtCv.findUnique({
    where: { userId },
    select: { chatSessionId: true },
  });

  if (existing?.chatSessionId) return existing.chatSessionId;

  // Create a new cv-builder chat session
  const session = await prisma.chatSession.create({
    data: { userId, kind: "cv-builder", title: "CV Builder" },
  });

  // Store the session id on the BuiltCv row (upsert in case the row is new)
  await prisma.builtCv.upsert({
    where: { userId },
    create: { userId, data: {} as object, chatSessionId: session.id },
    update: { chatSessionId: session.id },
  });

  return session.id;
}
