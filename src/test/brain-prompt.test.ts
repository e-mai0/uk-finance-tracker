import { describe, expect, it, vi } from "vitest";

// Mock heavy server-side dependencies that are not needed to test buildSystemPrompt
vi.mock("@/server/ai/tools", () => ({ buildTools: vi.fn(() => ({})) }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/memory/service", () => ({ memoryService: {} }));
vi.mock("@/server/ai/budget", () => ({ recordUsage: vi.fn() }));
vi.mock("ai", () => ({ streamText: vi.fn(), convertToModelMessages: vi.fn() }));

import { buildSystemPrompt } from "@/server/ai/brain";

describe("system prompt", () => {
  const core = [
    { path: "profile.md", content: "# Profile\n- LSE economics (confidence: high, confirmed: 2026-06-01)" },
    { path: "voice.md", content: "# Voice\n## Banned tells\n- Em dashes" },
    { path: "strategy.md", content: "# Strategy\n## Current direction\n- quant (confidence: medium, confirmed: 2026-06-01)" },
  ];

  it("includes core memory files and identity", () => {
    const p = buildSystemPrompt(core, [], []);
    expect(p).toContain("Cyclops");
    expect(p).toContain("LSE economics");
    expect(p).toContain("Banned tells");
  });

  it("forbids asserting medium/low confidence memory as fact", () => {
    const p = buildSystemPrompt(core, [], []);
    expect(p.toLowerCase()).toContain("confidence");
    expect(p).toContain("never assert");
  });

  it("injects pending gardener questions", () => {
    const p = buildSystemPrompt(core, ["In March you said macro - still true?"], []);
    expect(p).toContain("still true?");
  });

  it("mentions the CV handoff capability (go_to_cv)", () => {
    const p = buildSystemPrompt(core, [], []);
    expect(p).toContain("go_to_cv");
  });

  it("renders stale submitted applications as a nudge block", () => {
    const stale = [
      { employerName: "Goldman Sachs", roleTitle: "Summer Analyst", submittedAt: new Date("2026-04-01") },
    ];
    const p = buildSystemPrompt(core, [], stale);
    expect(p).toContain("Goldman Sachs");
    expect(p).toContain("Summer Analyst");
    expect(p).toContain("2026-04-01");
    expect(p).toContain("submitted");
  });
});
