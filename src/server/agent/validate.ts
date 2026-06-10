export type AgentConfidence = "high" | "medium" | "low";

export interface AgentField {
  fieldId: string;
  type: string;
  options?: string[];
}

export interface AgentAction {
  fieldId: string;
  value: string;
  reason: string;
  confidence: AgentConfidence;
}

const VALUE_CAP = 2000;
const OPTION_KINDS = new Set(["select", "radio"]);
const ALLOWED_KINDS = new Set([
  "text", "email", "tel", "url", "number",
  "textarea", "select", "radio", "checkbox", "date",
]);

/**
 * Fail-closed validation of model-proposed actions against the page fields
 * the extension actually submitted. Unknown fields, disallowed kinds,
 * non-option values, and duplicates are dropped, never "fixed".
 */
export function validateActions(
  actions: AgentAction[],
  fields: AgentField[],
): AgentAction[] {
  const byId = new Map(fields.map((f) => [f.fieldId, f]));
  const seen = new Set<string>();
  const out: AgentAction[] = [];
  for (const a of actions) {
    if (out.length >= fields.length) break;
    const field = byId.get(a.fieldId);
    if (!field || seen.has(a.fieldId)) continue;
    if (!ALLOWED_KINDS.has(field.type)) continue;
    let value = a.value.slice(0, VALUE_CAP);
    if (OPTION_KINDS.has(field.type)) {
      const match = (field.options ?? []).find(
        (o) => o.toLowerCase() === value.trim().toLowerCase(),
      );
      if (!match) continue;
      value = match;
    }
    if (field.type === "checkbox" && value !== "true" && value !== "false") {
      continue;
    }
    seen.add(a.fieldId);
    out.push({ ...a, value });
  }
  return out;
}
