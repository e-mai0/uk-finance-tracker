// src/server/actions/cv.ts
"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "@/server/auth";
import { isCvEmpty, type CvData } from "@/lib/cv";
import { persistCv } from "@/server/cv/store";
import { syncCvGrounding } from "@/server/cv/grounding";
import { gatherKnownProfile } from "@/server/cv/known-profile";
import { draftCvDataFromKnown } from "@/server/cv/generate";

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
  if (!cv) {
    return {
      error:
        "We couldn't draft an editable CV from your uploaded CV right now. Your uploaded CV is still saved.",
    };
  }
  if (isCvEmpty(cv)) {
    return { ok: true };
  }

  const saved = await persistCv(userId, cv);
  after(() => syncCvGrounding(userId));
  revalidatePath("/cv");
  return { ok: true, cv: saved };
}
