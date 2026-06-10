export interface StoredAuth {
  token?: string;
  apiBase?: string;
}

export interface FieldMapResponse {
  fields: Record<string, string>;
  hasCv: boolean;
}

export interface AnswerPayload {
  questionText: string;
  questionType?: "short" | "long" | "textarea" | "text";
  charLimit?: number;
  employer?: string;
  role?: string;
  externalUrl?: string;
  answer?: string;
  save?: boolean;
  // Draft-edit learning: included when saving an edited AI draft.
  original?: string;
  draftId?: string;
  // Story slugs to avoid when regenerating ("Different story"). Server caps at 10.
  excludeStories?: string[];
}

export interface TrackPayload {
  externalUrl: string;
  ats: string;
  employerName?: string;
  roleTitle?: string;
  status?: string;
}

export type FieldType =
  | "text" | "email" | "tel" | "url" | "number"
  | "textarea" | "select" | "radio" | "checkbox" | "date";

export interface FieldSchema {
  id: string;
  label: string;
  nearbyText?: string;
  type: FieldType;
  options?: string[];
  required: boolean;
  charLimit?: number;
}

export type FillAction = "fill" | "ask" | "draft" | "skip";

// Additive: newer servers attach a suggested value to "ask" plan items,
// sourced from memory facts or the answer bank. Older servers omit it.
export interface PlanSuggestion {
  label: string;
  value: string;
  source: "memory" | "bank";
  confidence: "high" | "medium" | "low";
}

// Additive: newer servers return provenance with generated answers. All
// fields optional so the panel degrades gracefully against older servers.
export interface DraftProvenance {
  storiesUsed?: string[]; // story slugs
  questionKind?: string;
  residualTells?: string[];
  thinGrounding?: boolean;
}

export interface FillPlanItem {
  fieldId: string;
  action: FillAction;
  value?: string;
  profileKey?: string;
  confidence: number;
  question?: string;
  reason?: string;
  suggestion?: PlanSuggestion;
}

export interface PlanPayload {
  fields: FieldSchema[];
  employer?: string;
  role?: string;
  url?: string;
}

// Agent assist (phase 4): bounded, confirmation-gated fallback rounds against
// POST /api/ext/agent. The background worker maps this onto the server's wire
// shape ({ fields: [{fieldId,...}], context, round }).
export interface AgentPayload {
  fields: (FieldSchema & { currentValue?: string })[];
  employer?: string;
  role?: string;
  url?: string;
  round: number;
}

export interface AgentProposedAction {
  fieldId: string;
  value: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface AgentResultPayload {
  actions: AgentProposedAction[];
  unresolved: { fieldId: string; question: string }[];
  done: boolean;
  round: number;
}

export interface FactPayload {
  profileKey?: string;
  questionText: string;
  answer: string;
}

export type BgRequest =
  | { type: "connect"; token: string; apiBase: string }
  | { type: "status" }
  | { type: "disconnect" }
  | { type: "getProfile" }
  | { type: "getCv" }
  | { type: "answer"; payload: AnswerPayload }
  | { type: "trackApplication"; payload: TrackPayload }
  | { type: "plan"; payload: PlanPayload }
  | { type: "agent"; payload: AgentPayload }
  | { type: "saveFact"; payload: FactPayload };

export interface BgResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}
