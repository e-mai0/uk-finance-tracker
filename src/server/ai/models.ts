import { createAnthropic } from "@ai-sdk/anthropic";

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
