import { afterEach, describe, expect, it, vi } from "vitest";
import { modelIdFor, modelFor, SONNET_ID, HAIKU_ID } from "@/server/ai/models";

afterEach(() => vi.unstubAllEnvs());

describe("modelIdFor", () => {
  it("defaults the writing roles to Claude when no env override is set", () => {
    expect(modelIdFor("draft")).toBe(SONNET_ID);
    expect(modelIdFor("critique")).toBe(HAIKU_ID);
    expect(modelIdFor("distill")).toBe(HAIKU_ID);
  });

  it("honours the MODEL_DRAFT / MODEL_CRITIQUE / MODEL_DISTILL overrides", () => {
    vi.stubEnv("MODEL_DRAFT", "meta-llama/llama-3.3-70b-instruct");
    vi.stubEnv("MODEL_CRITIQUE", "qwen/qwen-2.5-32b-instruct");
    vi.stubEnv("MODEL_DISTILL", "meta-llama/llama-3.1-8b-instruct");
    expect(modelIdFor("draft")).toBe("meta-llama/llama-3.3-70b-instruct");
    expect(modelIdFor("critique")).toBe("qwen/qwen-2.5-32b-instruct");
    expect(modelIdFor("distill")).toBe("meta-llama/llama-3.1-8b-instruct");
  });

  it("keeps chat / agent / research pinned to Claude Sonnet regardless of writing overrides", () => {
    vi.stubEnv("MODEL_DRAFT", "meta-llama/llama-3.3-70b-instruct");
    expect(modelIdFor("chat")).toBe(SONNET_ID);
    expect(modelIdFor("agent")).toBe(SONNET_ID);
    expect(modelIdFor("research")).toBe(SONNET_ID);
  });

});

describe("modelFor", () => {
  it("routes Claude defaults to the Anthropic provider, OSS ids to the gateway", () => {
    // modelFor always returns a model object (never a bare string id), so reading
    // .provider is safe; cast to access it without a union type error.
    const claudeProvider = (modelFor("draft") as { provider: string }).provider;
    expect(claudeProvider).toContain("anthropic");

    vi.stubEnv("MODEL_DRAFT", "meta-llama/llama-3.3-70b-instruct");
    const ossProvider = (modelFor("draft") as { provider: string }).provider;
    expect(ossProvider).toContain("gateway");
    expect(ossProvider).not.toBe(claudeProvider);
  });
});
