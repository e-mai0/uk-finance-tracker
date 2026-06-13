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
