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
}

export interface TrackPayload {
  externalUrl: string;
  ats: string;
  employerName?: string;
  roleTitle?: string;
  status?: string;
}

export type BgRequest =
  | { type: "connect"; token: string; apiBase: string }
  | { type: "status" }
  | { type: "disconnect" }
  | { type: "getProfile" }
  | { type: "getCv" }
  | { type: "answer"; payload: AnswerPayload }
  | { type: "trackApplication"; payload: TrackPayload };

export interface BgResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}
