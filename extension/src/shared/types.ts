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

export interface FillPlanItem {
  fieldId: string;
  action: FillAction;
  value?: string;
  profileKey?: string;
  confidence: number;
  question?: string;
  reason?: string;
}

export interface PlanPayload {
  fields: FieldSchema[];
  employer?: string;
  role?: string;
  url?: string;
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
  | { type: "saveFact"; payload: FactPayload };

export interface BgResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}
