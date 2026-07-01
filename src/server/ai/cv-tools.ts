// src/server/ai/cv-tools.ts
// The single AI tool available to the CV-builder chatbot.
// update_cv: replace the user's full CV with a new structured CvData.
import { jsonSchema, tool, zodSchema } from "ai";
import { cvDataSchema, type CvData } from "@/lib/cv";
import { getBuiltCv, persistCv } from "@/server/cv/store";

// The model-facing JSON schema is exactly what the AI SDK would derive from
// cvDataSchema — but wrapped with jsonSchema() and NO validate step, so execute
// receives the model's RAW payload. If cvDataSchema itself were the
// inputSchema, SDK-side zod validation would materialise `.default([])` for
// every key the model omitted, making a partial payload indistinguishable from
// a deliberate wipe — which is how partial updates were clearing saved
// sections. (Note: zod v3 `.partial()` does NOT help — defaults still fire.)
// Validation still happens inside execute via cvDataSchema.safeParse.
const updateCvInputSchema = jsonSchema(zodSchema(cvDataSchema).jsonSchema);

const CV_FIELDS = [
  "fullName",
  "headline",
  "contact",
  "summary",
  "education",
  "experience",
  "accomplishments",
  "projects",
  "skills",
  "interests",
  "sections",
] as const satisfies readonly (keyof CvData)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function mergeOmittedFields(rawInput: unknown, parsed: CvData, current: CvData | null): CvData {
  if (!current || !isRecord(rawInput)) return parsed;

  const preserved = Object.fromEntries(
    CV_FIELDS
      .filter((field) => !hasOwn(rawInput, field))
      .map((field) => [field, current[field]]),
  ) as Partial<CvData>;
  const merged = cvDataSchema.parse({ ...parsed, ...preserved });

  const rawContact = rawInput.contact;
  if (isRecord(rawContact)) {
    merged.contact = { ...current.contact, ...parsed.contact };
  }

  return cvDataSchema.parse(merged);
}

export function buildCvTools(userId: string) {
  return {
    update_cv: tool({
      description:
        "Replace the user's full CV with the provided structured data. " +
        "Always send the COMPLETE CV object (not a patch). Omitted existing fields are preserved. " +
        "To clear a list section, explicitly send it as an empty array. Returns the saved CV.",
      inputSchema: updateCvInputSchema,
      execute: async (data) => {
        const parsed = cvDataSchema.safeParse(data);
        if (!parsed.success) return { error: "invalid CV shape" };
        const existing = await getBuiltCv(userId);
        const next = mergeOmittedFields(data, parsed.data, existing?.cv ?? null);
        const cv = await persistCv(userId, next);
        return { ok: true, cv };
      },
    }),
  };
}
