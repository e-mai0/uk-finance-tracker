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

export const sonnet = anthropic(SONNET_ID);
export const haiku = anthropic(HAIKU_ID);

/**
 * Anthropic prompt-caching breakpoint. Attach as `providerOptions` on the message
 * (or system-message part) whose CUMULATIVE prefix should be cached: Anthropic caches
 * everything from the start of the request up to and including the marked block.
 *
 * Cached reads bill at ~10% of input and do not count against the input-tokens-per-
 * minute rate limit, so repeating an identical large static prefix (e.g. the playbook
 * across a draft's revise loop) becomes almost free after the first call.
 *
 * Minimum cacheable prefix (provider rule): 1024 tokens for Sonnet 4.x, 4096 for
 * Haiku 4.5. Only mark a block whose preceding content reliably clears that bar AND
 * is byte-identical across calls, or the write is wasted (no read ever hits).
 */
export const ANTHROPIC_CACHE_BREAKPOINT = {
  anthropic: { cacheControl: { type: "ephemeral" as const } },
} as const;

// ─── Model role-seam ──────────────────────────────────────────────────────────
//
// A behaviour-IDENTICAL indirection between the engine's call sites and the
// concrete model. Every role resolves to TODAY's Claude model by default, so
// production is unchanged. The seam exists only to GATE a later, separately
// user-approved cheap-model down-route: the eval harness flips ONE role's
// `MODEL_*` env var to a candidate id, runs the same engine path, and the gate
// in src/eval/gate.ts decides whether the candidate is good enough to ship.
//
// PRODUCTION LEAVES ALL `MODEL_*` UNSET. Setting any of them is for eval /
// experimentation only — and the writing roles (draft especially) must stay on
// Claude in prod. chat/agent/research are not overridable at all (no env key).

/** Every LLM role in the engine. */
export type ModelRole =
  | "draft"
  | "chat"
  | "agent"
  | "research"
  | "grader"
  | "critique"
  | "distill"
  | "gardener"
  | "cvFacts";

/**
 * The per-role Claude defaults — an exact mirror of CURRENT production:
 *   draft/chat/agent/research/grader → Sonnet (the writing + judgment roles)
 *   critique/distill/gardener/cvFacts → Haiku (the cheap mechanical roles)
 * These are the values every role resolves to unless an override env is set.
 */
export const CLAUDE_DEFAULT: Record<ModelRole, string> = {
  draft: SONNET_ID,
  chat: SONNET_ID,
  agent: SONNET_ID,
  research: SONNET_ID,
  grader: SONNET_ID,
  critique: HAIKU_ID,
  distill: HAIKU_ID,
  gardener: HAIKU_ID,
  cvFacts: HAIKU_ID,
};

/**
 * The OVERRIDABLE roles only, mapped to their env var. chat/agent/research are
 * intentionally absent: those user-facing writing/reasoning roles are pinned to
 * Claude and cannot be down-routed by env.
 */
export const ENV_KEY: Partial<Record<ModelRole, string>> = {
  draft: "MODEL_DRAFT",
  grader: "MODEL_GRADER",
  critique: "MODEL_CRITIQUE",
  distill: "MODEL_DISTILL",
  gardener: "MODEL_GARDENER",
  cvFacts: "MODEL_CV_FACTS",
};

/**
 * Resolve the model id for a role AT CALL TIME (not module load): an override
 * env var on an overridable role wins, otherwise the Claude default. A blank /
 * whitespace-only override is ignored (treated as unset).
 */
export function modelIdFor(role: ModelRole): string {
  const envKey = ENV_KEY[role];
  const override = envKey ? process.env[envKey]?.trim() : undefined;
  return override && override.length > 0 ? override : CLAUDE_DEFAULT[role];
}

/**
 * Resolve the LanguageModel for a role. Claude ids stay on the DIRECT Anthropic
 * provider — and reuse the cached `sonnet`/`haiku` singletons for the two default
 * ids — so #54's prompt-caching `providerOptions` keep working unchanged. Only a
 * non-Claude override id routes through the Vercel AI Gateway.
 */
export function modelFor(role: ModelRole): LanguageModel {
  const id = modelIdFor(role);
  if (id === SONNET_ID) return sonnet;
  if (id === HAIKU_ID) return haiku;
  return id.startsWith("claude") ? anthropic(id) : gateway(id);
}
