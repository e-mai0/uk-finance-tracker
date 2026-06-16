import { z } from "zod";
import { DEGREE_TYPES } from "./constants";

// ---------------------------------------------------------------------------
// Enum tuples (kept in sync with the Prisma enums)
// ---------------------------------------------------------------------------

export const ROLE_FAMILY_VALUES = [
  "IB",
  "MARKETS",
  "ASSET_MGMT",
  "PRIVATE_EQUITY",
  "HEDGE_FUND",
  "QUANT",
  "CORP_BANKING",
  "RESEARCH",
] as const;

export const WORK_AUTH_VALUES = [
  "UK_CITIZEN",
  "UK_SETTLED",
  "UK_VISA_REQUIRED",
  "OTHER",
] as const;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(100, "That password is too long"),
  // Early-access gate. Optional in the schema (so signup works once the gate is
  // lifted); when EARLY_ACCESS_CODE is set, signupAction enforces a match. The
  // secret is checked server-side only and never reaches the client bundle.
  inviteCode: z.string().trim().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Onboarding — per step
// ---------------------------------------------------------------------------

export const educationSchema = z.object({
  university: z.string().trim().min(2, "Tell us where you study").max(120),
  degreeSubject: z.string().trim().min(2, "Add your degree subject").max(120),
  degreeType: z.enum(DEGREE_TYPES, {
    // Without this, an unselected/invalid value surfaces Zod's raw
    // "Invalid enum value. Expected 'BA' | 'BSc' | …" string in the form.
    errorMap: () => ({ message: "Select your degree type" }),
  }),
  graduationYear: z
    .number({ message: "Add your graduation year" })
    .int()
    .min(2024, "Year looks too early")
    .max(2035, "Year looks too far out"),
  currentYear: z
    .number({ message: "Add your current year of study" })
    .int()
    .min(1, "Must be at least year 1")
    .max(7, "That seems too high"),
});

export const essentialsSchema = educationSchema.extend({
  targetRoleFamilies: z
    .array(
      z.enum(ROLE_FAMILY_VALUES, {
        errorMap: () => ({ message: "Pick from the listed areas" }),
      }),
    )
    .min(1, "Pick at least one area you're targeting"),
});

// ---------------------------------------------------------------------------
// Optional questionnaire — wizard step 3 and the Settings page. Every field
// is optional; absent locations default to "open to anywhere in the UK".
// ---------------------------------------------------------------------------

export const questionnaireSchema = z.object({
  workAuth: z
    .enum(WORK_AUTH_VALUES, {
      errorMap: () => ({ message: "Choose a valid work-authorization option" }),
    })
    .nullable()
    .optional(),
  gradeInfo: z
    .object({
      aLevels: z.string().trim().max(120).optional().or(z.literal("")),
      gcseSummary: z.string().trim().max(120).optional().or(z.literal("")),
      gpaOrEquivalent: z.string().trim().max(60).optional().or(z.literal("")),
    })
    .optional(),
  skills: z.array(z.string().trim().min(1)).max(20).default([]),
  preferredLocations: z.array(z.string().trim().min(1)).default([]),
  openToAnywhereUk: z.boolean().default(true),
  targetEmployers: z.array(z.string().trim().min(1)).max(40).default([]),
});

export type EducationInput = z.infer<typeof educationSchema>;
export type EssentialsInput = z.infer<typeof essentialsSchema>;
export type QuestionnaireInput = z.infer<typeof questionnaireSchema>;

// ---------------------------------------------------------------------------
// Settings (education + role-family targets) — the questionnaire covers the
// rest via saveQuestionnaire.
// ---------------------------------------------------------------------------

export const settingsSchema = essentialsSchema;
export type SettingsInput = z.infer<typeof settingsSchema>;

// ---------------------------------------------------------------------------
// Apply copilot — application profile + answer bank
// ---------------------------------------------------------------------------

const optStr = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

export const applyProfileSchema = z.object({
  phone: optStr(40),
  addressCity: optStr(120),
  country: optStr(80),
  linkedinUrl: optStr(200),
  githubUrl: optStr(200),
  websiteUrl: optStr(200),
  pronouns: optStr(40),
  noticePeriod: optStr(120),
  earliestStart: optStr(120),
  workAuthStatement: optStr(600),
  sponsorshipStatement: optStr(600),
  selfIdGender: optStr(80),
  selfIdEthnicity: optStr(120),
});

export type ApplyProfileInput = z.infer<typeof applyProfileSchema>;

export const answerBankItemSchema = z.object({
  questionText: z.string().trim().min(3, "Add the question").max(600),
  answer: z.string().trim().min(1, "Add an answer").max(6000),
  tags: z.array(z.string().trim().min(1)).max(12).default([]),
  employer: optStr(120),
});

export type AnswerBankItemInput = z.infer<typeof answerBankItemSchema>;

// Payload the extension POSTs to /api/ext/answer.
export const extAnswerSchema = z.object({
  questionText: z.string().trim().min(3).max(2000),
  questionType: z.enum(["short", "long", "textarea", "text"]).default("long"),
  charLimit: z.number().int().positive().max(20000).optional(),
  employer: optStr(160),
  role: optStr(200),
  externalUrl: optStr(500),
  // When provided, this exact text is saved/echoed instead of generating —
  // used by the panel's "Save to bank" on an edited answer.
  answer: z.string().trim().max(8000).optional(),
  save: z.boolean().default(false),
  // Draft-edit learning: the original AI-generated text and the draft's DB id.
  // When the user edits the draft before saving, original !== answer, and the
  // pair is captured as a DraftEdit for later voice distillation.
  original: z.string().max(8000).optional(),
  draftId: z.string().optional(),
  // Story slugs to exclude from selection (e.g. user clicked "Different story").
  excludeStories: z.array(z.string()).max(10).optional(),
});

export type ExtAnswerInput = z.infer<typeof extAnswerSchema>;

// Payload the extension POSTs to /api/ext/application.
export const extApplicationSchema = z.object({
  externalUrl: z.string().trim().url().max(500),
  ats: z.enum(["GREENHOUSE", "LEVER", "ASHBY", "WORKDAY", "OTHER"]).default("OTHER"),
  employerName: optStr(160),
  roleTitle: optStr(200),
  status: z
    .enum([
      "DRAFT",
      "AUTOFILLED",
      "SUBMITTED",
      "INTERVIEWING",
      "OFFER",
      "REJECTED",
      "WITHDRAWN",
    ])
    .default("AUTOFILLED"),
});

export type ExtApplicationInput = z.infer<typeof extApplicationSchema>;

// ---------------------------------------------------------------------------
// Apply copilot — universal form planning (/api/ext/plan)
// ---------------------------------------------------------------------------

export const FIELD_TYPES = [
  "text", "email", "tel", "url", "number",
  "textarea", "select", "radio", "checkbox", "date",
] as const;

export const fieldSchemaSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().max(400).default(""),
  nearbyText: z.string().trim().max(600).optional(),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string().trim().max(200)).max(80).optional(),
  required: z.boolean().default(false),
  charLimit: z.number().int().positive().max(20000).optional(),
});

export const extPlanRequestSchema = z.object({
  fields: z.array(fieldSchemaSchema).min(1).max(200),
  employer: optStr(160),
  role: optStr(200),
  url: optStr(500),
});

export type FieldSchema = z.infer<typeof fieldSchemaSchema>;
export type ExtPlanRequest = z.infer<typeof extPlanRequestSchema>;

/**
 * Coerce an untrusted /api/ext/plan body into something extPlanRequestSchema
 * will accept: truncate over-long strings, cap option lists, drop fields with a
 * missing id or unknown type, and limit the batch to 200 fields — so one
 * malformed field can't 400 the entire form. Mirrors the bounds above.
 */
export function sanitizePlanBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const b = body as Record<string, unknown>;
  const rawFields = Array.isArray(b.fields) ? b.fields : [];

  const fields = rawFields
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => {
      const typeOk =
        typeof f.type === "string" &&
        (FIELD_TYPES as readonly string[]).includes(f.type);
      const options = Array.isArray(f.options)
        ? f.options
            .filter((o): o is string => typeof o === "string")
            .slice(0, 80)
            .map((o) => o.slice(0, 200))
        : undefined;
      return {
        id: typeof f.id === "string" ? f.id.trim().slice(0, 40) : "",
        label: typeof f.label === "string" ? f.label.slice(0, 400) : "",
        nearbyText:
          typeof f.nearbyText === "string" ? f.nearbyText.slice(0, 600) : undefined,
        type: typeOk ? (f.type as string) : "",
        options: options && options.length ? options : undefined,
        required: f.required === true,
        charLimit:
          typeof f.charLimit === "number" && f.charLimit > 0
            ? Math.min(Math.floor(f.charLimit), 20000)
            : undefined,
      };
    })
    .filter((f) => f.id !== "" && f.type !== "")
    .slice(0, 200);

  return {
    fields,
    employer: typeof b.employer === "string" ? b.employer.slice(0, 160) : undefined,
    role: typeof b.role === "string" ? b.role.slice(0, 200) : undefined,
    url: typeof b.url === "string" ? b.url.slice(0, 500) : undefined,
  };
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

// Payload the extension POSTs to /api/ext/fact when the user answers a ❓.
export const extFactSchema = z.object({
  profileKey: optStr(60),
  questionText: z.string().trim().min(1).max(600),
  answer: z.string().trim().min(1).max(2000),
});

export type ExtFactInput = z.infer<typeof extFactSchema>;

// ---------------------------------------------------------------------------
// Agent fallback — bounded request/response rounds (/api/ext/agent)
// ---------------------------------------------------------------------------

export const extAgentFieldSchema = z.object({
  fieldId: z.string().trim().min(1).max(100),
  label: z.string().trim().max(300),
  type: z.string().trim().max(30),
  options: z.array(z.string().trim().max(200)).max(40).optional(),
  currentValue: z.string().max(2000).optional(),
  required: z.boolean().optional(),
});

export const extAgentRequestSchema = z.object({
  fields: z.array(extAgentFieldSchema).min(1).max(60),
  context: z
    .object({
      employer: optStr(200),
      role: optStr(200),
      url: optStr(2000),
    })
    .default({}),
  round: z.number().int().min(1).max(3),
});

export type ExtAgentRequest = z.infer<typeof extAgentRequestSchema>;
