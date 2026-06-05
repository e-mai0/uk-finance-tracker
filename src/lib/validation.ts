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
  degreeType: z.enum(DEGREE_TYPES),
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

export const interestsSchema = z.object({
  targetRoleFamilies: z
    .array(z.enum(ROLE_FAMILY_VALUES))
    .min(1, "Pick at least one area you're targeting"),
  skills: z.array(z.string().trim().min(1)).max(20).default([]),
});

export const eligibilitySchema = z.object({
  workAuth: z.enum(WORK_AUTH_VALUES, {
    message: "Select your work authorization",
  }),
  // Optional academic info — supported but never required for the MVP.
  gradeInfo: z
    .object({
      aLevels: z.string().trim().max(120).optional().or(z.literal("")),
      gcseSummary: z.string().trim().max(120).optional().or(z.literal("")),
      gpaOrEquivalent: z.string().trim().max(60).optional().or(z.literal("")),
    })
    .optional(),
});

export const targetsSchema = z.object({
  preferredLocations: z.array(z.string().trim().min(1)).default([]),
  openToAnywhereUk: z.boolean().default(false),
  targetEmployers: z.array(z.string().trim().min(1)).max(40).default([]),
  // CV metadata only for the MVP (no file parsing/storage).
  cvFileName: z.string().trim().max(200).optional().or(z.literal("")),
  cvFileSize: z.number().int().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// Full onboarding payload (validated server-side on finish)
// ---------------------------------------------------------------------------

export const onboardingSchema = educationSchema
  .merge(interestsSchema)
  .merge(eligibilitySchema)
  .merge(targetsSchema)
  .refine(
    (d) => d.openToAnywhereUk || d.preferredLocations.length > 0,
    {
      message: "Pick at least one location, or select 'open to anywhere in the UK'",
      path: ["preferredLocations"],
    },
  );

export type EducationInput = z.infer<typeof educationSchema>;
export type InterestsInput = z.infer<typeof interestsSchema>;
export type EligibilityInput = z.infer<typeof eligibilitySchema>;
export type TargetsInput = z.infer<typeof targetsSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;

// ---------------------------------------------------------------------------
// Settings (profile + preferences edit) — reuses onboarding shape
// ---------------------------------------------------------------------------

export const settingsSchema = onboardingSchema;
export type SettingsInput = z.infer<typeof settingsSchema>;
