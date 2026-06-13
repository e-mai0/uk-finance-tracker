// src/server/ai/cv-tools.ts
// The single AI tool available to the CV-builder chatbot.
// update_cv: replace the user's full CV with a new structured CvData.
import { tool } from "ai";
import { cvDataSchema } from "@/lib/cv";
import { persistCv } from "@/server/cv/store";

export function buildCvTools(userId: string) {
  return {
    update_cv: tool({
      description:
        "Replace the user's full CV with the provided structured data. " +
        "Always send the COMPLETE CV object (not a patch). Returns the saved CV.",
      inputSchema: cvDataSchema,
      execute: async (data) => {
        const parsed = cvDataSchema.safeParse(data);
        if (!parsed.success) return { error: "invalid CV shape" };
        const cv = await persistCv(userId, parsed.data);
        return { ok: true, cv };
      },
    }),
  };
}
