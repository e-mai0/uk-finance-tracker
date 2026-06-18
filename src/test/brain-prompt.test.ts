import { describe, expect, it, vi } from "vitest";

// Mock heavy server-side dependencies that are not needed to test buildSystemPrompt
vi.mock("@/server/ai/tools", () => ({ buildTools: vi.fn(() => ({})) }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/memory/service", () => ({ memoryService: {} }));
vi.mock("@/server/ai/budget", () => ({ recordUsage: vi.fn() }));
vi.mock("ai", () => ({ streamText: vi.fn(), convertToModelMessages: vi.fn() }));

import { buildSystemPrompt, latestUserText } from "@/server/ai/brain";
import { coachBlock } from "@/server/engine/playbook";

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

  it("injects the playbook coach block (expert applications standards)", () => {
    const p = buildSystemPrompt(core, [], []);
    // The exact coach block must be present (no-op wiring must fail this).
    expect(p).toContain(coachBlock());
    // and its distinctive coaching phrases survive composition
    expect(p.toLowerCase()).toContain("spring");
    expect(p.toLowerCase()).toContain("summer");
  });

  it("preserves all existing brain content alongside the coach block", () => {
    const p = buildSystemPrompt(core, [], []);
    expect(p).toContain("Core memory");
    expect(p).toContain("Memory rules");
    expect(p).toContain("never assert");
    expect(p).toContain("Formatting");
  });

  it("recall ordering is wired: a message matching strategy.md moves it to an edge", () => {
    // strategy.md content mentions 'quant'; a 'quant' message should make it the
    // most relevant file → placed at the TOP edge (edge-arrange puts the single
    // most-relevant file first). Without recall wiring it would stay in its
    // fixed third position, so this assertion guards the wiring.
    const p = buildSystemPrompt(core, [], [], "tell me about quant roles");
    const profileIdx = p.indexOf('path="profile.md"');
    const strategyIdx = p.indexOf('path="strategy.md"');
    expect(strategyIdx).toBeGreaterThanOrEqual(0);
    expect(profileIdx).toBeGreaterThanOrEqual(0);
    // strategy.md (the relevant file) now precedes profile.md (originally first)
    expect(strategyIdx).toBeLessThan(profileIdx);
  });

  it("recall never drops memory: all core content present regardless of ordering", () => {
    const p = buildSystemPrompt(core, [], [], "quant markets spring week");
    expect(p).toContain("LSE economics");
    expect(p).toContain("Banned tells");
    expect(p).toContain("quant");
    // decay annotation still applied around recall (medium fact is older but the
    // brain still injects raw file content here; content integrity is what matters)
    expect(p.match(/<file path=/g)?.length).toBe(3);
  });

  it("empty / absent latest message → original-order injection (fallback)", () => {
    const p = buildSystemPrompt(core, [], []);
    const profileIdx = p.indexOf('path="profile.md"');
    const voiceIdx = p.indexOf('path="voice.md"');
    const strategyIdx = p.indexOf('path="strategy.md"');
    expect(profileIdx).toBeLessThan(voiceIdx);
    expect(voiceIdx).toBeLessThan(strategyIdx);
  });

  it("latestUserText pulls the most recent user text part", () => {
    expect(
      latestUserText([
        { id: "1", role: "user", parts: [{ type: "text", text: "first" }] },
        { id: "2", role: "assistant", parts: [{ type: "text", text: "reply" }] },
        { id: "3", role: "user", parts: [{ type: "text", text: "second question" }] },
      ] as never),
    ).toBe("second question");
    expect(latestUserText([] as never)).toBe("");
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
