import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
}));

vi.mock("ai", () => ({
  generateObject: mockGenerateObject,
}));

import { runGardener, buildGardenerPrompt } from "@/server/memory/gardener";
import { createMemoryService } from "@/server/memory/service";
import { fakeDb } from "./helpers/fake-memory-db";

describe("gardener", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("macro→PE→quant→policy: supersedes into single current direction + history", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        proposals: [
          {
            path: "strategy.md",
            newContent: `# Strategy

## Current direction
- Focused on quant research roles (confidence: medium, confirmed: 2026-06-09)

## History
- 2026-03: macro investing
- 2026-04: software private equity
`,
            reason: "supersede contradictory direction changes",
          },
        ],
        questions: [
          "In March you said macro investing, now quant research - is quant the current focus?",
        ],
      },
    });

    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");
    await svc.write(
      "u1",
      "strategy.md",
      `# Strategy\n\n## Current direction\n- Interested in macro investing (confidence: high, confirmed: 2026-03-01)\n- Leaning software private equity (confidence: high, confirmed: 2026-04-01)\n- Targeting quant research (confidence: high, confirmed: 2026-05-01)\n\n## History\n`,
      "CYCLOPS",
    );

    const saveQuestion = vi.fn();
    const recordRun = vi.fn();
    const result = await runGardener("u1", svc, { saveQuestion, recordRun });

    const after = await svc.read("u1", "strategy.md");
    expect(after!.content).toContain("quant research");
    // macro investing must no longer appear under Current direction
    // (it may legitimately appear under History)
    expect(after!.content).not.toMatch(
      /## Current direction[\s\S]*macro investing[\s\S]*## History/,
    );
    expect(after!.content).toContain("## History");
    expect(result.questions.length).toBeLessThanOrEqual(3);
    expect(saveQuestion).toHaveBeenCalledTimes(1);
    expect(recordRun).toHaveBeenCalledTimes(1);
    // result has skipped count
    expect(result.skipped).toBe(0);
  });

  it("prompt includes every file and the anti-rot rules", async () => {
    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");
    const prompt = await buildGardenerPrompt("u1", svc);
    expect(prompt).toContain("strategy.md");
    expect(prompt.toLowerCase()).toContain("supersede");
    expect(prompt.toLowerCase()).toContain("raw notes");
  });

  it("proposal that rewrites Raw notes section is skipped", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        proposals: [
          {
            path: "stories/x.md",
            // newContent deliberately omits the original Raw notes text
            newContent: `# Story X

## Raw notes
DIFFERENT TEXT - gardener tried to rewrite raw notes
`,
            reason: "attempted raw-notes rewrite",
          },
        ],
        questions: [],
      },
    });

    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");
    // Write a stories file with Raw notes section
    const originalContent = `# Story X

## Raw notes
My original raw notes that must never be changed.
`;
    await svc.write("u1", "stories/x.md", originalContent, "USER");

    const saveQuestion = vi.fn();
    const recordRun = vi.fn();
    const result = await runGardener("u1", svc, { saveQuestion, recordRun });

    // File must be unchanged
    const after = await svc.read("u1", "stories/x.md");
    expect(after!.content).toBe(originalContent);

    // Applied count must exclude the skipped proposal
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);

    // recordRun still fires (run still happened)
    expect(recordRun).toHaveBeenCalledTimes(1);
  });

  // Item 1: CRLF file + LF proposal preserving notes → applied
  it("CRLF raw-notes file: LF proposal preserving notes is applied", async () => {
    const originalContent = "# Story X\r\n\r\n## Raw notes\r\nMy original raw notes.\r\n";
    // Proposal uses LF but preserves the raw notes text (normalized)
    const newContent = "# Story X\n\n## Raw notes\nMy original raw notes.\n\n## Summary\nUpdated summary.\n";

    mockGenerateObject.mockResolvedValueOnce({
      object: {
        proposals: [{ path: "stories/x.md", newContent, reason: "add summary" }],
        questions: [],
      },
    });

    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");
    await svc.write("u1", "stories/x.md", originalContent, "USER");

    const saveQuestion = vi.fn();
    const recordRun = vi.fn();
    const result = await runGardener("u1", svc, { saveQuestion, recordRun });

    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    const after = await svc.read("u1", "stories/x.md");
    expect(after!.content).toBe(newContent);
  });

  // Item 1: ## Raw Notes (case variant) with altered notes → skipped
  it("case-variant ## Raw Notes heading: proposal with altered notes is skipped", async () => {
    const originalContent = "# Story X\n\n## Raw Notes\nOriginal notes here.\n";
    const newContent = "# Story X\n\n## Raw Notes\nALTERED notes here.\n";

    mockGenerateObject.mockResolvedValueOnce({
      object: {
        proposals: [{ path: "stories/x.md", newContent, reason: "alter notes" }],
        questions: [],
      },
    });

    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");
    await svc.write("u1", "stories/x.md", originalContent, "USER");

    const saveQuestion = vi.fn();
    const recordRun = vi.fn();
    const result = await runGardener("u1", svc, { saveQuestion, recordRun });

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    const after = await svc.read("u1", "stories/x.md");
    expect(after!.content).toBe(originalContent);
  });

  // Item 1: two raw-notes sections where proposal drops the second → skipped
  it("two raw-notes sections: proposal dropping second section is skipped", async () => {
    const originalContent = `# Doc\n\n## Raw notes\nFirst notes.\n\n## Middle\nSome content.\n\n## Raw notes\nSecond notes.\n`;
    // Proposal keeps first but drops second
    const newContent = `# Doc\n\n## Raw notes\nFirst notes.\n\n## Middle\nUpdated content.\n`;

    mockGenerateObject.mockResolvedValueOnce({
      object: {
        proposals: [{ path: "doc.md", newContent, reason: "missing second raw notes" }],
        questions: [],
      },
    });

    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");
    await svc.write("u1", "doc.md", originalContent, "USER");

    const saveQuestion = vi.fn();
    const recordRun = vi.fn();
    const result = await runGardener("u1", svc, { saveQuestion, recordRun });

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    const after = await svc.read("u1", "doc.md");
    expect(after!.content).toBe(originalContent);
  });

  // Item 2: proposal for non-existent file → not applied, no file created
  it("proposal for non-existent file is skipped (no mint)", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        proposals: [
          { path: "companies/new-co.md", newContent: "# New Co\n\nNotes.\n", reason: "new company" },
        ],
        questions: [],
      },
    });

    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");

    const saveQuestion = vi.fn();
    const recordRun = vi.fn();
    const result = await runGardener("u1", svc, { saveQuestion, recordRun });

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    const file = await svc.read("u1", "companies/new-co.md");
    expect(file).toBeNull();
    expect(recordRun).toHaveBeenCalledTimes(1);
  });

  // Item 4: file with >6000 chars appears truncated in the prompt
  it("file content >6000 chars is truncated in the prompt", async () => {
    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");
    const longContent = "x".repeat(7000);
    await svc.write("u1", "strategy.md", longContent, "USER");
    const prompt = await buildGardenerPrompt("u1", svc);
    // Should not contain the full 7000-char string
    expect(prompt).not.toContain("x".repeat(7000));
    // Should contain truncation marker
    expect(prompt).toContain("[truncated]");
    // Should contain the first 6000 chars
    expect(prompt).toContain("x".repeat(6000));
  });

  // Item 5: generateObject rejects → recordRun still called, result is empty, no throw
  it("generateObject error: recordRun still called, returns empty result, no throw", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("AI exploded"));

    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");

    const saveQuestion = vi.fn();
    const recordRun = vi.fn();

    // Must not throw
    const result = await runGardener("u1", svc, { saveQuestion, recordRun });

    expect(result).toEqual({ applied: 0, skipped: 0, questions: [] });
    expect(recordRun).toHaveBeenCalledTimes(1);
    expect(saveQuestion).not.toHaveBeenCalled();
  });

  // Item 7: duplicate question filtered
  it("duplicate questions are filtered out", async () => {
    const existingQ = "In March you said macro investing, now quant research - is quant the current focus?";
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        proposals: [],
        questions: [
          existingQ, // duplicate
          "A brand new question?",
        ],
      },
    });

    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");

    const saveQuestion = vi.fn();
    const recordRun = vi.fn();
    const result = await runGardener("u1", svc, { saveQuestion, recordRun }, [existingQ]);

    // Only the new question should be saved
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toBe("A brand new question?");
    expect(saveQuestion).toHaveBeenCalledTimes(1);
    expect(saveQuestion).toHaveBeenCalledWith("u1", "A brand new question?");
  });

  // Item 7: case-insensitive duplicate detection
  it("duplicate questions are filtered case-insensitively", async () => {
    const existingQ = "Is your target still quant research?";
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        proposals: [],
        questions: [
          "IS YOUR TARGET STILL QUANT RESEARCH?", // duplicate (case different)
          "Another fresh question?",
        ],
      },
    });

    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");

    const saveQuestion = vi.fn();
    const recordRun = vi.fn();
    const result = await runGardener("u1", svc, { saveQuestion, recordRun }, [existingQ]);

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toBe("Another fresh question?");
  });

  // Item 8: one invalid path + one valid → applied === 1, valid one applied
  it("invalid path proposal errors without aborting valid proposals", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        proposals: [
          { path: "../evil.md", newContent: "evil", reason: "path traversal" },
          { path: "strategy.md", newContent: "# Strategy\n\nValid update.\n", reason: "valid" },
        ],
        questions: [],
      },
    });

    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");

    const saveQuestion = vi.fn();
    const recordRun = vi.fn();
    const result = await runGardener("u1", svc, { saveQuestion, recordRun });

    expect(result.applied).toBe(1);
    const after = await svc.read("u1", "strategy.md");
    expect(after!.content).toBe("# Strategy\n\nValid update.\n");
    expect(recordRun).toHaveBeenCalledTimes(1);
    // error was logged
    expect(console.error).toHaveBeenCalled();
  });
});
