import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const SONNET_ID = "claude-sonnet-4-6";
export const HAIKU_ID = "claude-haiku-4-5";

export const sonnet = anthropic(SONNET_ID);
export const haiku = anthropic(HAIKU_ID);
