// src/test/cv-handoff-tool.test.ts
// Tests for the main brain's `go_to_cv` navigation-signal tool (Cycle 5 U4a).
// This pins the MECHANISM only: the tool's output contract (shape + values),
// request passthrough, purity (no DB), and registration in the main toolset.
// It deliberately does NOT test whether the LLM CHOOSES the tool for a given
// sentence — that is non-deterministic intent classification (Amber, sampled).
import { describe, it, expect, vi } from "vitest";

// Heavy server-side deps that buildTools imports but go_to_cv never touches.
// Mock them so the toolset can be constructed without a DB/embeddings/engine.
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/memory/service", () => ({ memoryService: {} }));
vi.mock("@/server/memory/facts", () => ({ annotateDecay: vi.fn() }));
vi.mock("@/server/memory/gardener", () => ({ rawNotesGuardPasses: vi.fn() }));
vi.mock("@/server/ai/tool-guards", () => ({
  isAllowedMemoryPath: vi.fn(),
  stripDecayAnnotations: vi.fn(),
  normalizeReasons: vi.fn(),
}));
vi.mock("@/server/ai/embed", () => ({ semanticSearch: vi.fn() }));
vi.mock("@/server/engine/research", () => ({ ensureEmployerResearch: vi.fn() }));
vi.mock("@/server/engine/substance", () => ({ gatherSubstance: vi.fn() }));
vi.mock("@/server/engine/draft", () => ({ draftText: vi.fn() }));
vi.mock("@/server/engine/outcomes", () => ({ distillOutcomesForUser: vi.fn() }));
vi.mock("@/ingestion/import", () => ({ slugify: vi.fn() }));

const { buildTools } = await import("@/server/ai/tools");

describe("go_to_cv navigation-signal tool", () => {
  const USER = "user-xyz";

  it("is registered in the main brain toolset", () => {
    const tools = buildTools(USER);
    expect(tools.go_to_cv).toBeDefined();
    expect(typeof tools.go_to_cv.execute).toBe("function");
  });

  it("returns the exact navigation signal { kind, to, pane, request }", async () => {
    const tools = buildTools(USER);
    const execute = tools.go_to_cv.execute!;
    const result = await execute({ request: "tighten my summary" }, {} as never);

    expect(result).toEqual({
      kind: "navigate",
      to: "/cv",
      pane: "refine",
      request: "tighten my summary",
    });
  });

  it("passes the user's request through verbatim", async () => {
    const tools = buildTools(USER);
    const execute = tools.go_to_cv.execute!;
    const req = "tailor my CV to Goldman Sachs IBD and make my bullets quantified";
    const result = await execute({ request: req }, {} as never);

    expect((result as { request: string }).request).toBe(req);
  });

  it("uses kind:'navigate' as the discriminant and targets /cv refine", async () => {
    const tools = buildTools(USER);
    const execute = tools.go_to_cv.execute!;
    const result = (await execute({ request: "improve my CV" }, {} as never)) as {
      kind: string;
      to: string;
      pane: string;
    };

    expect(result.kind).toBe("navigate");
    expect(result.to).toBe("/cv");
    expect(result.pane).toBe("refine");
  });

  it("is pure: executing it does not call the database", async () => {
    const { prisma } = (await import("@/server/db")) as unknown as { prisma: Record<string, unknown> };
    const tools = buildTools(USER);
    const execute = tools.go_to_cv.execute!;
    await execute({ request: "make my CV punchier" }, {} as never);

    // No prisma methods exist on the mock; touching one would have thrown.
    expect(Object.keys(prisma)).toHaveLength(0);
  });
});
