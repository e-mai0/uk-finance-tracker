import { describe, expect, it } from "vitest";
import {
  buildRecallMemory,
  rankFactLines,
  __test__,
} from "@/server/memory/recall";

/** Extract every fact-style line ("- … (confidence: …, confirmed: …)") from a string. */
function factLines(s: string): string[] {
  return s
    .split("\n")
    .filter((l) => /^- .+\(confidence: (high|medium|low), confirmed: \d{4}-\d{2}-\d{2}\)/.test(l));
}

/** The exact CURRENT (pre-recall) injection: straight concatenation in original order. */
function legacyConcat(files: { path: string; content: string }[]): string {
  return files.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join("\n");
}

const PROFILE = {
  path: "profile.md",
  content: `# Profile
## Academics
- Studies economics at LSE (confidence: high, confirmed: 2026-06-01)
## Interests & constraints
- Needs visa sponsorship to work in the UK (confidence: high, confirmed: 2026-05-01)`,
};

const VOICE = {
  path: "voice.md",
  content: `# Voice
## Banned tells
- Em dashes
## Observed traits
- Writes short and plain (confidence: medium, confirmed: 2026-04-01)`,
};

const STRATEGY = {
  path: "strategy.md",
  content: `# Strategy
## Current direction
- Targeting a spring week at Goldman Sachs in M&A (confidence: high, confirmed: 2026-06-10)
- Interested in markets and rates trading (confidence: medium, confirmed: 2026-03-01)
## History
## Raw notes
- raw: said something about Citi once, unverified
- raw: rowing captain detail`,
};

const ALL = [PROFILE, VOICE, STRATEGY];

describe("recall: fact-preservation invariant (NEVER drop a fact)", () => {
  it("output fact set equals input fact set for any message", () => {
    const input = new Set(factLines(legacyConcat(ALL)));
    for (const msg of [
      "How should I answer Goldman's spring week question?",
      "tell me about my visa situation",
      "",
      "rates trading commercial awareness",
    ]) {
      const out = buildRecallMemory(ALL, msg);
      const outSet = new Set(factLines(out));
      expect(outSet).toEqual(input);
    }
  });

  it("never loses the raw-notes lines and keeps them under their heading", () => {
    const out = buildRecallMemory(ALL, "Goldman M&A spring week");
    expect(out).toContain("## Raw notes");
    expect(out).toContain("raw: said something about Citi once, unverified");
    expect(out).toContain("raw: rowing captain detail");
  });
});

describe("recall: section / file structure integrity", () => {
  it("preserves each file's internal line order (no destructive intra-file reordering)", () => {
    const out = buildRecallMemory(ALL, "spring week Goldman");
    // Strategy file's internal order must be intact: current direction before history before raw notes
    const idxDirection = out.indexOf("## Current direction");
    const idxHistory = out.indexOf("## History");
    const idxRaw = out.indexOf("## Raw notes");
    expect(idxDirection).toBeGreaterThanOrEqual(0);
    expect(idxHistory).toBeGreaterThan(idxDirection);
    expect(idxRaw).toBeGreaterThan(idxHistory);
  });

  it("keeps each file wrapped in its <file path> envelope", () => {
    const out = buildRecallMemory(ALL, "anything");
    for (const f of ALL) {
      expect(out).toContain(`<file path="${f.path}">`);
    }
    expect(out.match(/<file path=/g)?.length).toBe(ALL.length);
    expect(out.match(/<\/file>/g)?.length).toBe(ALL.length);
  });
});

describe("recall: relevance ordering + edge placement", () => {
  it("places the file matching the user message at an EDGE (top or bottom)", () => {
    // Message strongly overlaps strategy.md (spring week, Goldman, M&A)
    const out = buildRecallMemory(ALL, "help me with my Goldman Sachs spring week M&A answer");
    const order = ALL.map((f) => ({ path: f.path, idx: out.indexOf(`path="${f.path}"`) }))
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.path);
    // strategy.md (most relevant) must be at one of the two edges
    expect([order[0], order[order.length - 1]]).toContain("strategy.md");
  });

  it("does NOT place an irrelevant file at the very top", () => {
    // Message about visas/profile; voice.md is irrelevant and must not lead
    const out = buildRecallMemory(ALL, "do I need visa sponsorship in the UK economics LSE");
    const order = ALL.map((f) => ({ path: f.path, idx: out.indexOf(`path="${f.path}"`) }))
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.path);
    expect(order[0]).not.toBe("voice.md");
    // the most relevant (profile.md) sits at an edge
    expect([order[0], order[order.length - 1]]).toContain("profile.md");
  });

  it("rankFactLines: a term-matching fact outscores an unrelated fact", () => {
    const ranked = rankFactLines(
      [
        "- Targeting a spring week at Goldman Sachs in M&A (confidence: high, confirmed: 2026-06-10)",
        "- Writes short and plain (confidence: medium, confirmed: 2026-04-01)",
      ],
      "Goldman Sachs spring week",
      new Date("2026-06-17"),
    );
    expect(ranked[0]).toContain("Goldman");
  });

  it("rankFactLines: recency breaks ties when term overlap is equal", () => {
    // Neither matches the message, so overlap is 0 for both → recency decides
    const ranked = rankFactLines(
      [
        "- Old fact about nothing relevant (confidence: high, confirmed: 2026-01-01)",
        "- New fact about nothing relevant (confidence: high, confirmed: 2026-06-15)",
      ],
      "xyzzy unrelated query terms",
      new Date("2026-06-17"),
    );
    expect(ranked[0]).toContain("New fact");
  });
});

describe("recall: fallback-on-error / degenerate input", () => {
  it("empty user message → original-order legacy concatenation", () => {
    const out = buildRecallMemory(ALL, "");
    expect(out).toBe(legacyConcat(ALL));
  });

  it("empty file list → empty string (legacy behavior), no throw", () => {
    expect(() => buildRecallMemory([], "anything")).not.toThrow();
    expect(buildRecallMemory([], "anything")).toBe("");
  });

  it("single file → identical to legacy (nothing to reorder), no throw", () => {
    const out = buildRecallMemory([STRATEGY], "Goldman spring week");
    expect(out).toBe(legacyConcat([STRATEGY]));
  });

  it("internal ranking throw is caught and falls back to legacy order", () => {
    // Force the ranker to throw via the test hook; output must equal legacy concat.
    const out = __test__.buildWithRanker(ALL, "Goldman spring week", () => {
      throw new Error("boom");
    });
    expect(out).toBe(legacyConcat(ALL));
    // and still contains every fact
    expect(new Set(factLines(out))).toEqual(new Set(factLines(legacyConcat(ALL))));
  });
});
