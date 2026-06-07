import type { FieldSchema, FillPlanItem } from "./validation";
import { matchKey, classifyQuestion } from "./field-keys";

/**
 * Deterministic pre-pass. Decides each field with no LLM:
 *  - known key + stored value           → fill
 *  - essay textarea                      → draft
 *  - known key, no value / factual field → ask
 * Items the caller may want the LLM to re-examine are exactly the "ask" items
 * with no profileKey (genuinely unrecognized).
 */
export function buildDeterministicPlan(
  fields: FieldSchema[],
  values: Record<string, string>,
): FillPlanItem[] {
  return fields.map((field) => {
    const key = matchKey(field.label);

    if (key && values[key]) {
      return {
        fieldId: field.id,
        action: "fill",
        value: values[key],
        profileKey: key,
        confidence: 0.95,
      };
    }

    if (classifyQuestion(field.label, field.type) === "essay") {
      return { fieldId: field.id, action: "draft", confidence: 0.5 };
    }

    return {
      fieldId: field.id,
      action: "ask",
      profileKey: key ?? undefined,
      question: askText(field.label),
      confidence: key ? 0.6 : 0.3,
    };
  });
}

function askText(label: string): string {
  const clean = label.replace(/\s+/g, " ").trim();
  if (!clean) return "What should I enter here?";
  return clean.endsWith("?") ? clean : `${clean}?`;
}

/** The "ask" items the LLM pass should try to resolve (unrecognized only). */
export function unresolvedFieldIds(plan: FillPlanItem[]): string[] {
  return plan
    .filter((p) => p.action === "ask" && !p.profileKey)
    .map((p) => p.fieldId);
}

export interface LlmMapping {
  fieldId: string;
  profileKey: string;
  confidence: number;
}

const MIN_LLM_CONFIDENCE = 0.6;

/** Build the user-message text asking the LLM to map unresolved fields to value keys. */
export function buildMappingPrompt(
  unresolved: FieldSchema[],
  values: Record<string, string>,
): string {
  const keys = Object.keys(values);
  const fieldLines = unresolved
    .map((f) => {
      const opts = f.options?.length ? ` options=[${f.options.join(", ")}]` : "";
      const near = f.nearbyText ? ` context="${f.nearbyText}"` : "";
      return `- id=${f.id} type=${f.type} label="${f.label}"${opts}${near}`;
    })
    .join("\n");

  return [
    "Map each form field to ONE of the applicant's known value keys, or omit it if none fit.",
    "Only use keys from this list:",
    keys.map((k) => `  ${k} = ${values[k]}`).join("\n"),
    "",
    "Fields:",
    fieldLines,
    "",
    'Respond with JSON only: {"mappings":[{"fieldId":"...","profileKey":"...","confidence":0-1}]}.',
    "Omit a field entirely if no key is a confident match. Do not invent keys.",
  ].join("\n");
}

/**
 * Apply LLM mappings on top of the deterministic plan: a confident mapping to a
 * key that has a value upgrades that field's "ask" to a "fill".
 */
export function mergeMappings(
  plan: FillPlanItem[],
  values: Record<string, string>,
  mappings: LlmMapping[],
): FillPlanItem[] {
  const byId = new Map(mappings.map((m) => [m.fieldId, m]));
  return plan.map((item) => {
    if (item.action !== "ask") return item;
    const m = byId.get(item.fieldId);
    if (!m || m.confidence < MIN_LLM_CONFIDENCE) return item;
    const value = values[m.profileKey];
    if (!value) return item;
    return {
      ...item,
      action: "fill",
      value,
      profileKey: m.profileKey,
      confidence: m.confidence,
      question: undefined,
    };
  });
}

/** Parse the LLM's JSON response into mappings, tolerating prose/code fences. */
export function parseMappings(raw: string): LlmMapping[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { mappings?: unknown };
    if (!Array.isArray(parsed.mappings)) return [];
    return parsed.mappings
      .filter(
        (m): m is LlmMapping =>
          !!m &&
          typeof (m as LlmMapping).fieldId === "string" &&
          typeof (m as LlmMapping).profileKey === "string" &&
          typeof (m as LlmMapping).confidence === "number",
      )
      .map((m) => ({ fieldId: m.fieldId, profileKey: m.profileKey, confidence: m.confidence }));
  } catch {
    return [];
  }
}
