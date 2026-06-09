import { describe, expect, it, vi } from "vitest";

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

    // recordRun still fires (run still happened)
    expect(recordRun).toHaveBeenCalledTimes(1);
  });
});
