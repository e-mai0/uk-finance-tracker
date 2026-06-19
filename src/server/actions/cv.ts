// src/server/actions/cv.ts
"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "@/server/auth";
import { isCvEmpty, type CvData } from "@/lib/cv";
import { persistCv, ensureCvChatSession } from "@/server/cv/store";
import { syncCvGrounding } from "@/server/cv/grounding";
import { gatherKnownProfile } from "@/server/cv/known-profile";
import { draftCvDataFromKnown } from "@/server/cv/generate";
import { seedCoachOpening } from "@/server/cv/coach";

export interface BuildCvResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  cv?: CvData;
}

/** Draft (and persist) a CV from everything the app already knows about the user. */
export async function draftCvFromKnown(): Promise<BuildCvResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Your session has expired. Sign in again." };

  const known = await gatherKnownProfile(userId);
  const cv = await draftCvDataFromKnown(userId, known);
  // The draft failed transiently AND the user has an uploaded CV: do NOT persist
  // the lossy baseline stub — that would clobber the rich uploaded CV already in
  // builtCv.data. Leave the saved CV untouched and tell the user it's safe.
  if (!cv) return { error: "Draft failed — your uploaded CV is still saved." };
  // The from-scratch baseline yielded nothing substantive (no profile to draft
  // from): don't clobber an existing CV with an empty stub. The client surfaces
  // a "needs more to work with" notice for the (ok: true, no cv) shape.
  if (isCvEmpty(cv)) return { ok: true };
  const saved = await persistCv(userId, cv);

  // Seed the CV coach's grounded opening (assessment + 3 chips) as the chat
  // session's first assistant message, so the refine pane is never silent.
  // Best-effort: seedCoachOpening never throws and never blocks the draft.
  const sessionId = await ensureCvChatSession(userId);
  await seedCoachOpening({ userId, sessionId, cv: saved });

  after(() => syncCvGrounding(userId));
  revalidatePath("/cv");
  return { ok: true, cv: saved };
}
