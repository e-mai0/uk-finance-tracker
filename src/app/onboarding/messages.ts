/**
 * Friendly, NON-BLOCKING notice shown when the voice-distillation step can't run
 * (no AI credit, budget exhausted, transient failure). Onboarding still
 * completes — the account is marked onboarded before the AI steps — so this only
 * tells the user Cyclops will learn their voice later. Never exposes internals.
 *
 * Lives in a plain (non-"use server") module so it can be a non-async export
 * imported by both the server action and client components — a "use server"
 * module may only export async functions.
 */
export const ONBOARDING_VOICE_FAIL_MESSAGE =
  "We couldn't analyze your writing voice just now — no problem, Cyclops will learn it as you go.";
