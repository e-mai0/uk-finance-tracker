import { describe, expect, it } from "vitest";
import { parseStory, classifyQuestion, selectStories } from "@/server/engine/stories";
import type { Story } from "@/server/engine/types";

const ROWING = `---
title: Rowing club treasurer turnaround
themes: [leadership, pressure]
employers_used:
  - { employer: goldman-sachs, date: 2026-10-02, question_kind: leadership }
strength_signal: high
failure_signal: null
timeline: 2024-09..2025-06
confidence: high
last_confirmed: 2026-06-09
---
## Raw notes
Club was 800 quid in the red. I rebuilt the budget.

## Final versions
As treasurer I found an 800 pound deficit...
`;

describe("parseStory", () => {
  it("parses frontmatter and sections", () => {
    const s = parseStory("stories/rowing-club.md", ROWING);
    expect(s).not.toBeNull();
    expect(s!.slug).toBe("rowing-club");
    expect(s!.themes).toEqual(["leadership", "pressure"]);
    expect(s!.employersUsed[0].employer).toBe("goldman-sachs");
    expect(s!.strengthSignal).toBe("high");
    expect(s!.rawNotes).toContain("800 quid");
    expect(s!.finalVersions).toContain("As treasurer");
  });

  it("returns null for files without frontmatter", () => {
    expect(parseStory("stories/x.md", "# just prose")).toBeNull();
  });
});

describe("classifyQuestion", () => {
  it.each([
    ["Why do you want to work at Barclays?", "motivation"],
    ["Tell us about a time you led a team under pressure", "leadership"],
    ["Describe a time you worked in a team", "teamwork"],
    ["Tell us about a failure and what you learned", "failure"],
    ["Describe a recent market trend that interests you", "commercial"],
    ["What are your key strengths?", "strengths"],
    ["Anything else we should know?", "general"],
  ])("%s -> %s", (q, kind) => {
    expect(classifyQuestion(q).kind).toBe(kind);
  });

  it("returns themes for story-backed kinds", () => {
    expect(classifyQuestion("Tell us about a time you led a project").themes).toContain("leadership");
  });
});

describe("selectStories", () => {
  const mk = (slug: string, themes: string[], used: string[], strength: string | null): Story => ({
    path: `stories/${slug}.md`,
    slug,
    title: slug,
    themes,
    employersUsed: used.map((employer) => ({ employer })),
    strengthSignal: strength,
    failureSignal: null,
    timeline: "",
    rawNotes: "notes",
    finalVersions: "",
  });

  it("excludes stories already used at this employer", () => {
    const out = selectStories([mk("a", ["leadership"], ["goldman-sachs"], "high"), mk("b", ["leadership"], [], null)], {
      themes: ["leadership"],
      employerSlug: "goldman-sachs",
      max: 2,
    });
    expect(out.map((s) => s.slug)).toEqual(["b"]);
  });

  it("prefers high strength_signal and matches themes", () => {
    const out = selectStories(
      [mk("weak", ["teamwork"], [], null), mk("strong", ["teamwork"], [], "high"), mk("off", ["analysis"], [], "high")],
      { themes: ["teamwork"], employerSlug: undefined, max: 1 },
    );
    expect(out.map((s) => s.slug)).toEqual(["strong"]);
  });

  it("returns empty for kinds with no themes", () => {
    expect(selectStories([mk("a", ["leadership"], [], "high")], { themes: [], employerSlug: undefined, max: 2 })).toEqual([]);
  });
});
