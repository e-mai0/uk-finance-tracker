// src/server/ai/cv-tools.ts
// The single AI tool available to the CV-builder chatbot.
// update_cv: replace the user's full CV with a new structured CvData.
import { tool } from "ai";
import { cvDataSchema, type CvData } from "@/lib/cv";
import { getBuiltCv, persistCv } from "@/server/cv/store";

const cvUpdateInputSchema = cvDataSchema.partial();

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

const ARRAY_CV_FIELDS = [
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

function isArrayCvField(field: keyof CvData): field is (typeof ARRAY_CV_FIELDS)[number] {
  return (ARRAY_CV_FIELDS as readonly (keyof CvData)[]).includes(field);
}

function shouldPreserveField(
  rawInput: Record<string, unknown>,
  current: CvData,
  field: keyof CvData,
): boolean {
  if (!hasOwn(rawInput, field)) return true;

  // Models sometimes emit schema-default empty arrays while making a small
  // partial edit. In that partial shape, do not let those defaults wipe stored
  // CV sections; a complete CV payload may still intentionally replace them.
  const payloadIsComplete = CV_FIELDS.every((candidate) => hasOwn(rawInput, candidate));
  if (!payloadIsComplete && isArrayCvField(field)) {
    const rawValue = rawInput[field];
    const currentValue = current[field];
    return (
      Array.isArray(rawValue) &&
      rawValue.length === 0 &&
      Array.isArray(currentValue) &&
      currentValue.length > 0
    );
  }

  return false;
}

function mergeOmittedFields(rawInput: unknown, parsed: CvData, current: CvData | null): CvData {
  if (!current || !isRecord(rawInput)) return parsed;

  const preserved = Object.fromEntries(
    CV_FIELDS
      .filter((field) => shouldPreserveField(rawInput, current, field))
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
        "Always send the COMPLETE CV object (not a patch). Omitted existing fields are preserved. Returns the saved CV.",
      inputSchema: cvUpdateInputSchema,
      execute: async (data) => {
        const parsed = cvUpdateInputSchema.safeParse(data);
        if (!parsed.success) return { error: "invalid CV shape" };
        const existing = await getBuiltCv(userId);
        const next = mergeOmittedFields(data, cvDataSchema.parse(parsed.data), existing?.cv ?? null);
        const cv = await persistCv(userId, next);
        return { ok: true, cv };
      },
    }),
  };
}
