// src/test/draft-text-tool.test.ts
// Tests for the main brain's `draft_text` tool — specifically the wordLimit
// caller wiring (Cycle: expert-drafting follow-up to U2). U2 added an optional
// `wordLimit` to the engine's DraftArgs and threads it into generation +
// provenance.wordCap, but no caller populated it. This pins that the tool:
//   - forwards an explicit `wordLimit` into the draftText args;
//   - derives an approximate word cap from `charLimit` when no explicit
//     wordLimit is supplied (round(charLimit / 6));
//   - leaves wordLimit undefined when neither is supplied (existing behaviour).
import { describe, it, expect, vi, beforeEach } from "vitest";

// Heavy server-side deps buildTools imports but draft_text never touches (or
// that we want inert). draftText + gatherSubstance are the engine seams we
// assert against; prisma.generatedDraft.create must be a no-op so execute runs.
vi.mock("@/server/db", () => ({
  prisma: { generatedDraft: { create: vi.fn(async () => ({})) } },
}));
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
vi.mock("@/server/engine/substance", () => ({ gatherSubstance: vi.fn(async () => ({})) }));
vi.mock("@/server/engine/draft", () => ({
  draftText: vi.fn(async () => ({
    text: "drafted answer",
    provenance: { model: "test-model" },
  })),
}));
vi.mock("@/server/engine/outcomes", () => ({ distillOutcomesForUser: vi.fn() }));
vi.mock("@/ingestion/import", () => ({ slugify: vi.fn() }));

const { buildTools } = await import("@/server/ai/tools");
const { draftText } = (await import("@/server/engine/draft")) as unknown as {
  draftText: ReturnType<typeof vi.fn>;
};

const USER = "user-draft";

describe("draft_text tool — wordLimit caller wiring", () => {
  beforeEach(() => {
    draftText.mockClear();
  });

  it("is registered with an execute fn", () => {
    const tools = buildTools(USER);
    expect(tools.draft_text).toBeDefined();
    expect(typeof tools.draft_text.execute).toBe("function");
  });

  it("forwards an explicit wordLimit into the draftText args", async () => {
    const tools = buildTools(USER);
    const execute = tools.draft_text.execute!;
    await execute(
      { kind: "ANSWER", question: "Why this firm?", wordLimit: 250 },
      {} as never,
    );

    expect(draftText).toHaveBeenCalledTimes(1);
    const args = draftText.mock.calls[0][2];
    expect(args.wordLimit).toBe(250);
  });

  it("derives wordLimit from charLimit when no explicit wordLimit is given (round(charLimit/6))", async () => {
    const tools = buildTools(USER);
    const execute = tools.draft_text.execute!;
    await execute(
      { kind: "ANSWER", question: "Tell us about a time...", charLimit: 1500 },
      {} as never,
    );

    const args = draftText.mock.calls[0][2];
    expect(args.wordLimit).toBe(Math.round(1500 / 6)); // 250
    // charLimit must keep its original meaning — unchanged.
    expect(args.charLimit).toBe(1500);
  });

  it("prefers an explicit wordLimit over the charLimit-derived one", async () => {
    const tools = buildTools(USER);
    const execute = tools.draft_text.execute!;
    await execute(
      { kind: "ANSWER", question: "Why us?", charLimit: 1500, wordLimit: 120 },
      {} as never,
    );

    const args = draftText.mock.calls[0][2];
    expect(args.wordLimit).toBe(120);
    expect(args.charLimit).toBe(1500);
  });

  it("leaves wordLimit undefined when neither wordLimit nor charLimit is given", async () => {
    const tools = buildTools(USER);
    const execute = tools.draft_text.execute!;
    await execute({ kind: "ANSWER", question: "Open question" }, {} as never);

    const args = draftText.mock.calls[0][2];
    expect(args.wordLimit).toBeUndefined();
  });
});
