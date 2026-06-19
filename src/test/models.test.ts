import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CLAUDE_DEFAULT,
  ENV_KEY,
  HAIKU_ID,
  SONNET_ID,
  haiku,
  modelFor,
  modelIdFor,
  sonnet,
  type ModelRole,
} from "@/server/ai/models";

/**
 * The model role-seam. These tests pin the behaviour-IDENTICAL contract:
 * every role resolves to TODAY's Claude model by default, only the documented
 * overridable roles read an env var, and the writing/chat roles stay on Claude.
 *
 * No network: modelFor's provider/id are asserted from the returned object's
 * shape, never by calling the model.
 */

const ALL_ROLES: ModelRole[] = [
  "draft",
  "chat",
  "agent",
  "research",
  "grader",
  "critique",
  "distill",
  "gardener",
  "cvFacts",
];

// Snapshot + restore every MODEL_* env var these tests touch so they never leak.
const ENV_VARS = [
  "MODEL_DRAFT",
  "MODEL_GRADER",
  "MODEL_CRITIQUE",
  "MODEL_DISTILL",
  "MODEL_GARDENER",
  "MODEL_CV_FACTS",
  "MODEL_CHAT",
  "MODEL_AGENT",
  "MODEL_RESEARCH",
];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("CLAUDE_DEFAULT — pins today's per-role production models", () => {
  it("draft/chat/agent/research/grader default to Sonnet", () => {
    for (const role of ["draft", "chat", "agent", "research", "grader"] as ModelRole[]) {
      expect(CLAUDE_DEFAULT[role]).toBe(SONNET_ID);
    }
  });

  it("critique/distill/gardener/cvFacts default to Haiku", () => {
    for (const role of ["critique", "distill", "gardener", "cvFacts"] as ModelRole[]) {
      expect(CLAUDE_DEFAULT[role]).toBe(HAIKU_ID);
    }
  });

  it("every role has a default and it is a Claude id", () => {
    for (const role of ALL_ROLES) {
      expect(CLAUDE_DEFAULT[role]).toBeDefined();
      expect(CLAUDE_DEFAULT[role].startsWith("claude")).toBe(true);
    }
  });

  // Mutation guard: if a future edit silently flips a default off Claude, this fails RED.
  it("MUTATION GUARD: the exact default map is the frozen Claude lineup", () => {
    expect(CLAUDE_DEFAULT).toEqual({
      draft: SONNET_ID,
      chat: SONNET_ID,
      agent: SONNET_ID,
      research: SONNET_ID,
      grader: SONNET_ID,
      critique: HAIKU_ID,
      distill: HAIKU_ID,
      gardener: HAIKU_ID,
      cvFacts: HAIKU_ID,
    });
    // And those ids are literally today's production Claude models.
    expect(SONNET_ID).toBe("claude-sonnet-4-6");
    expect(HAIKU_ID).toBe("claude-haiku-4-5");
  });
});

describe("ENV_KEY — only the overridable roles expose an env var", () => {
  it("maps exactly the six overridable roles", () => {
    expect(ENV_KEY).toEqual({
      draft: "MODEL_DRAFT",
      grader: "MODEL_GRADER",
      critique: "MODEL_CRITIQUE",
      distill: "MODEL_DISTILL",
      gardener: "MODEL_GARDENER",
      cvFacts: "MODEL_CV_FACTS",
    });
  });

  it("chat/agent/research have NO env key (pinned Claude)", () => {
    expect(ENV_KEY.chat).toBeUndefined();
    expect(ENV_KEY.agent).toBeUndefined();
    expect(ENV_KEY.research).toBeUndefined();
  });
});

describe("modelIdFor — resolves at call time", () => {
  it("returns the Claude default for every role when no env is set", () => {
    for (const role of ALL_ROLES) {
      expect(modelIdFor(role)).toBe(CLAUDE_DEFAULT[role]);
    }
  });

  it("an override on an overridable role changes ONLY that role", () => {
    process.env.MODEL_GRADER = "openai/gpt-4o-mini";
    expect(modelIdFor("grader")).toBe("openai/gpt-4o-mini");
    // No bleed into neighbouring roles.
    expect(modelIdFor("draft")).toBe(SONNET_ID);
    expect(modelIdFor("critique")).toBe(HAIKU_ID);
  });

  it("each overridable role reads its own env var independently", () => {
    process.env.MODEL_DRAFT = "vendor/draft-model";
    process.env.MODEL_CRITIQUE = "vendor/critique-model";
    process.env.MODEL_DISTILL = "vendor/distill-model";
    process.env.MODEL_GARDENER = "vendor/gardener-model";
    process.env.MODEL_CV_FACTS = "vendor/cvfacts-model";
    expect(modelIdFor("draft")).toBe("vendor/draft-model");
    expect(modelIdFor("critique")).toBe("vendor/critique-model");
    expect(modelIdFor("distill")).toBe("vendor/distill-model");
    expect(modelIdFor("gardener")).toBe("vendor/gardener-model");
    expect(modelIdFor("cvFacts")).toBe("vendor/cvfacts-model");
    // The one role we did NOT set stays on its Claude default.
    expect(modelIdFor("grader")).toBe(SONNET_ID);
  });

  it("chat/agent/research are NOT overridable even if a stray MODEL_* is set", () => {
    process.env.MODEL_CHAT = "evil/cheap-model";
    process.env.MODEL_AGENT = "evil/cheap-model";
    process.env.MODEL_RESEARCH = "evil/cheap-model";
    expect(modelIdFor("chat")).toBe(SONNET_ID);
    expect(modelIdFor("agent")).toBe(SONNET_ID);
    expect(modelIdFor("research")).toBe(SONNET_ID);
  });

  it("reads env at CALL time, not at module load", () => {
    expect(modelIdFor("grader")).toBe(SONNET_ID);
    process.env.MODEL_GRADER = "late/binding-model";
    expect(modelIdFor("grader")).toBe("late/binding-model");
    delete process.env.MODEL_GRADER;
    expect(modelIdFor("grader")).toBe(SONNET_ID);
  });

  it("trims surrounding whitespace and ignores a blank override", () => {
    process.env.MODEL_GRADER = "  openai/gpt-4o-mini  ";
    expect(modelIdFor("grader")).toBe("openai/gpt-4o-mini");
    process.env.MODEL_GRADER = "   ";
    expect(modelIdFor("grader")).toBe(SONNET_ID);
  });
});

describe("modelFor — Claude defaults stay on the direct Anthropic provider", () => {
  it("returns an anthropic-backed model for every default role (caching-safe)", () => {
    for (const role of ALL_ROLES) {
      const m = modelFor(role);
      // LanguageModel may be a string id in the union, but our Claude path always
      // returns a provider instance (so #54's providerOptions caching keeps working).
      expect(typeof m).toBe("object");
      expect((m as { provider: string }).provider).toContain("anthropic");
      expect((m as { modelId: string }).modelId).toBe(CLAUDE_DEFAULT[role]);
    }
  });

  it("returns the SAME cached Sonnet/Haiku singleton for the defaults (preserves #54 cache handle)", () => {
    // draft/grader default to Sonnet → the exact exported `sonnet` instance.
    expect(modelFor("draft")).toBe(sonnet);
    expect(modelFor("grader")).toBe(sonnet);
    // critique/distill/gardener/cvFacts default to Haiku → the exact `haiku` instance.
    expect(modelFor("critique")).toBe(haiku);
    expect(modelFor("distill")).toBe(haiku);
    expect(modelFor("gardener")).toBe(haiku);
    expect(modelFor("cvFacts")).toBe(haiku);
  });

  it("routes a NON-Claude override through the Vercel AI gateway", () => {
    process.env.MODEL_GRADER = "openai/gpt-4o-mini";
    const m = modelFor("grader");
    expect(typeof m).toBe("object");
    expect((m as { provider: string }).provider).toBe("gateway");
    expect((m as { modelId: string }).modelId).toBe("openai/gpt-4o-mini");
  });

  it("a Claude-id override still uses the direct Anthropic provider (not the gateway)", () => {
    process.env.MODEL_DRAFT = "claude-3-5-sonnet-latest";
    const m = modelFor("draft");
    expect((m as { provider: string }).provider).toContain("anthropic");
    expect((m as { modelId: string }).modelId).toBe("claude-3-5-sonnet-latest");
  });
});
