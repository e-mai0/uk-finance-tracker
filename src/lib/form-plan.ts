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
