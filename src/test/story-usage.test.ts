import { describe, expect, it } from "vitest";
import { appendUsage } from "@/server/engine/story-usage";

const STORY_WITH_EMPLOYERS = `---
title: Rowing club treasurer turnaround
themes:
  - leadership
  - pressure
employers_used:
  - employer: goldman-sachs
    date: '2026-10-02'
    question_kind: leadership
strength_signal: high
failure_signal: null
timeline: 2024-09..2025-06
---
## Raw notes
Club was 800 quid in the red. I rebuilt the budget.

## Final versions
As treasurer I found an 800 pound deficit and turned it around.
`;

const STORY_EMPTY_EMPLOYERS = `---
title: Rowing club treasurer turnaround
themes:
  - leadership
  - pressure
employers_used: []
strength_signal: high
failure_signal: null
timeline: 2024-09..2025-06
---
## Raw notes
Club was 800 quid in the red.

## Final versions
As treasurer I found an 800 pound deficit.
`;

const STORY_NO_FRONTMATTER = `# Just prose
No frontmatter here.
`;

describe("appendUsage", () => {
  it("appends to an empty employers_used list", () => {
    const entry = { employer: "barclays", date: "2026-06-10", question_kind: "teamwork" };
    const result = appendUsage(STORY_EMPTY_EMPLOYERS, entry);

    // Should contain the new entry
    expect(result).toContain("barclays");
    expect(result).toContain("teamwork");
    expect(result).toContain("2026-06-10");

    // Body must be preserved byte-for-byte
    expect(result).toContain("Club was 800 quid in the red.");
    expect(result).toContain("As treasurer I found an 800 pound deficit.");
  });

  it("deduplicates same employer+question_kind", () => {
    // goldman-sachs + leadership already exists
    const entry = { employer: "goldman-sachs", date: "2026-06-10", question_kind: "leadership" };
    const result = appendUsage(STORY_WITH_EMPLOYERS, entry);

    // Should not add a second goldman-sachs/leadership entry
    const matches = (result.match(/goldman-sachs/g) ?? []).length;
    expect(matches).toBe(1);
    expect(result).toBe(STORY_WITH_EMPLOYERS);
  });

  it("allows same employer with a different question_kind", () => {
    // goldman-sachs + teamwork is new (existing is goldman-sachs + leadership)
    const entry = { employer: "goldman-sachs", date: "2026-06-10", question_kind: "teamwork" };
    const result = appendUsage(STORY_WITH_EMPLOYERS, entry);

    // Now goldman-sachs should appear twice
    const matches = (result.match(/goldman-sachs/g) ?? []).length;
    expect(matches).toBe(2);
    expect(result).toContain("teamwork");
  });

  it("preserves Raw notes body byte-for-byte", () => {
    const entry = { employer: "barclays", date: "2026-06-10", question_kind: "pressure" };
    const result = appendUsage(STORY_WITH_EMPLOYERS, entry);

    // Exact body sections preserved
    expect(result).toContain("Club was 800 quid in the red. I rebuilt the budget.");
    expect(result).toContain("As treasurer I found an 800 pound deficit and turned it around.");
  });

  it("returns input unchanged on malformed frontmatter (no --- marker)", () => {
    const entry = { employer: "barclays", date: "2026-06-10", question_kind: "teamwork" };
    const result = appendUsage(STORY_NO_FRONTMATTER, entry);
    expect(result).toBe(STORY_NO_FRONTMATTER);
  });

  it("appends a new employer+kind when list already has other entries", () => {
    const entry = { employer: "jpmorgan", date: "2026-06-10", question_kind: "leadership" };
    const result = appendUsage(STORY_WITH_EMPLOYERS, entry);

    expect(result).toContain("jpmorgan");
    // Original entry still present
    expect(result).toContain("goldman-sachs");
  });
});
