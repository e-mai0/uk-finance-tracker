import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const sonnet = anthropic("claude-sonnet-4-6");
export const haiku = anthropic("claude-haiku-4-5");
