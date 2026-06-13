import { createAnthropic } from "@ai-sdk/anthropic";
import { gateway, type LanguageModel } from "ai";

// Pin the API base URL explicitly. The SDK otherwise reads ANTHROPIC_BASE_URL
// from the environment, and some hosts (e.g. Claude Desktop) export it as
// `https://api.anthropic.com` without the `/v1` suffix — which makes every
// request 404 against `/messages` instead of `/v1/messages`.
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: "https://api.anthropic.com/v1",
});

export const SONNET_ID = "claude-sonnet-4-6";
export const HAIKU_ID = "claude-haiku-4-5";

// Back-compat: chat (brain.ts), agentic autofill (ext/agent), research,
// gardener, cv/facts, tools, onboarding still import these directly.
export const sonnet = anthropic(SONNET_ID);
export const haiku = anthropic(HAIKU_ID);

/**
 * Roles the app routes models by. Writing roles (draft/critique/distill) can be
 * pointed at open-source models via env; everything else stays on Claude.
 * Extension autofill answers go through `draftText`, so they ride the `draft` role.
 */
export type ModelRole = "draft" | "critique" | "distill" | "chat" | "agent" | "research";

const CLAUDE_DEFAULT: Record<ModelRole, string> = {
  draft: SONNET_ID,
  critique: HAIKU_ID,
  distill: HAIKU_ID,
  chat: SONNET_ID,
  agent: SONNET_ID,
  research: SONNET_ID,
};

// Only the writing roles are env-overridable. Resolved at call time (not module
// load) so tests and runtime can change the environment freely.
const ENV_KEY: Partial<Record<ModelRole, string>> = {
  draft: "MODEL_DRAFT",
  critique: "MODEL_CRITIQUE",
  distill: "MODEL_DISTILL",
};

/** The resolved model id string for a role (env override, else Claude default). */
export function modelIdFor(role: ModelRole): string {
  const key = ENV_KEY[role];
  const override = key ? process.env[key]?.trim() : undefined;
  return override || CLAUDE_DEFAULT[role];
}

/**
 * A LanguageModel for a role. Claude ids use the direct Anthropic provider,
 * which keeps prompt-caching providerOptions working; anything else routes
 * through the Vercel AI Gateway (auth via AI_GATEWAY_API_KEY, or the Vercel
 * OIDC token automatically on deployments).
 */
export function modelFor(role: ModelRole): LanguageModel {
  const id = modelIdFor(role);
  return id.startsWith("claude") ? anthropic(id) : gateway(id);
}
