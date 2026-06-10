import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  deriveStorySignal,
  buildOutcomeObservation,
  upsertObservationLine,
  distillOutcomes,
} from "@/server/engine/outcomes";
import { createMemoryService } from "@/server/memory/service";
import { fakeDb } from "./helpers/fake-memory-db";

const TODAY = new Date().toISOString().slice(0, 10);

describe("deriveStorySignal", () => {
  it("any positive outcome -> strength high", () => {
    expect(deriveStorySignal([{ status: "INTERVIEWING" }, { status: "REJECTED" }])).toEqual({
      strength: "high",
      failure: null,
      clearFailure: true,
    });
  });
  it("2+ rejections, no positives -> failure note, strength untouched", () => {
    const r = deriveStorySignal([{ status: "REJECTED" }, { status: "REJECTED" }]);
    expect(r.strength).toBeNull();
    expect(r.failure).toContain("2 rejected");
    expect(r.clearFailure).toBe(false);
  });
  it("small sample -> no change", () => {
    expect(deriveStorySignal([{ status: "REJECTED" }])).toEqual({
      strength: null,
      failure: null,
      clearFailure: false,
    });
  });
});

describe("buildOutcomeObservation", () => {
  it("needs at least 4 settled applications", () => {
    expect(buildOutcomeObservation([{ status: "REJECTED" }, { status: "OFFER" }], "2026-06-10")).toBeNull();
  });
  it("summarises progression with low confidence", () => {
    const apps = [
      { status: "INTERVIEWING" },
      { status: "REJECTED" },
      { status: "REJECTED" },
      { status: "OFFER" },
      { status: "SUBMITTED" }, // unsettled, excluded from the rate
    ];
    const line = buildOutcomeObservation(apps, "2026-06-10");
    expect(line).toContain("2 of 4");
    expect(line).toContain("(confidence: low, confirmed: 2026-06-10)");
  });
});

describe("upsertObservationLine", () => {
  it("removes ALL duplicate observation lines and keeps exactly one", () => {
    const corrupt = `# Strategy

## Observations
- Application outcomes: 1 of 4 old

## Observations
- Application outcomes: 1 of 4 old
`;
    const next = upsertObservationLine(corrupt, "- Application outcomes: 2 of 5 new");
    const lines = next.match(/^- Application outcomes: /gm) ?? [];
    expect(lines).toHaveLength(1);
    expect(next).toContain("2 of 5 new");
    expect(next).not.toContain("1 of 4 old");
  });

  it("inserts under an existing ## Observations heading instead of appending another", () => {
    const content = `# Strategy

## Observations

## History
`;
    const next = upsertObservationLine(content, "- Application outcomes: 2 of 4 x");
    expect(next.match(/^## Observations$/gm) ?? []).toHaveLength(1);
    expect(next).toMatch(/## Observations\n- Application outcomes: 2 of 4 x/);
  });
});

// ---------------------------------------------------------------------------
// Effectful path (dependency-injected, fake memory DB)
// ---------------------------------------------------------------------------

const FOUR_SETTLED = [
  { employerName: "Acme", status: "INTERVIEWING" },
  { employerName: "Beta", status: "OFFER" },
  { employerName: "Gamma", status: "REJECTED" },
  { employerName: "Delta", status: "REJECTED" },
];

function setup(initialApps: { employerName: string | null; status: string }[] = []) {
  const db = fakeDb();
  const svc = createMemoryService(db);
  const apps = [...initialApps];
  const deps = { svc, listApplications: async () => [...apps] };
  return { svc, apps, deps };
}

const countObservationLines = (content: string) =>
  (content.match(/^- Application outcomes: /gm) ?? []).length;
const countObservationHeadings = (content: string) =>
  (content.match(/^## Observations\s*$/gm) ?? []).length;

describe("distillOutcomes (effectful)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first run appends ## Observations + line to strategy.md", async () => {
    const { svc, deps } = setup(FOUR_SETTLED);
    await distillOutcomes("u1", deps);

    const strategy = await svc.read("u1", "strategy.md");
    expect(strategy!.content).toContain("## Observations");
    expect(strategy!.content).toContain(
      `- Application outcomes: 2 of 4 settled applications progressed to interview or offer (confidence: low, confirmed: ${TODAY})`,
    );
    expect(countObservationLines(strategy!.content)).toBe(1);
  });

  it("second run with changed counts supersedes in place (one line, one heading)", async () => {
    const { svc, apps, deps } = setup(FOUR_SETTLED);
    await distillOutcomes("u1", deps);

    apps.push({ employerName: "Epsilon", status: "REJECTED" });
    await distillOutcomes("u1", deps);

    const strategy = await svc.read("u1", "strategy.md");
    expect(countObservationLines(strategy!.content)).toBe(1);
    expect(countObservationHeadings(strategy!.content)).toBe(1);
    expect(strategy!.content).toContain("2 of 5 settled");
    expect(strategy!.content).not.toContain("2 of 4 settled");
  });

  it("second run with unchanged counts performs NO write", async () => {
    const { svc, deps } = setup(FOUR_SETTLED);
    await distillOutcomes("u1", deps);
    const revsBefore = await svc.revisions("u1", "strategy.md");

    await distillOutcomes("u1", deps);
    const revsAfter = await svc.revisions("u1", "strategy.md");
    expect(revsAfter).toHaveLength(revsBefore.length);
  });

  it("corrupt strategy.md with TWO observation lines converges to one", async () => {
    const { svc, deps } = setup(FOUR_SETTLED);
    await svc.list("u1");
    await svc.write(
      "u1",
      "strategy.md",
      `# Strategy

## Current direction

## History

## Observations
- Application outcomes: 1 of 4 settled applications progressed to interview or offer (confidence: low, confirmed: 2026-01-01)

## Observations
- Application outcomes: 1 of 4 settled applications progressed to interview or offer (confidence: low, confirmed: 2026-01-01)
`,
      "CYCLOPS",
    );

    await distillOutcomes("u1", deps);

    const strategy = await svc.read("u1", "strategy.md");
    expect(countObservationLines(strategy!.content)).toBe(1);
    expect(strategy!.content).toContain("2 of 4 settled");
    expect(strategy!.content).not.toContain("1 of 4 settled");
  });

  it("story used by a rejected-twice employer gains failure_signal; unchanged on re-run", async () => {
    const { svc, deps } = setup([
      { employerName: "Goldman Sachs", status: "REJECTED" },
      { employerName: "Goldman Sachs", status: "REJECTED" },
    ]);
    await svc.list("u1");
    await svc.write(
      "u1",
      "stories/treasurer.md",
      `---
title: Treasurer turnaround
employers_used:
  - employer: goldman-sachs
    date: '2026-05-01'
    question_kind: leadership
---
## Raw notes
Club was 800 quid in the red.
`,
      "USER",
    );

    await distillOutcomes("u1", deps);

    const story = await svc.read("u1", "stories/treasurer.md");
    expect(story!.content).toContain("used in 2 rejected applications");
    expect(story!.content).toContain("Club was 800 quid in the red.");
    const revsBefore = await svc.revisions("u1", "stories/treasurer.md");

    await distillOutcomes("u1", deps);
    const revsAfter = await svc.revisions("u1", "stories/treasurer.md");
    expect(revsAfter).toHaveLength(revsBefore.length);
  });

  it("positive outcome clears a stale failure_signal", async () => {
    const { svc, deps } = setup([
      { employerName: "Goldman Sachs", status: "REJECTED" },
      { employerName: "Goldman Sachs", status: "INTERVIEWING" },
    ]);
    await svc.list("u1");
    await svc.write(
      "u1",
      "stories/treasurer.md",
      `---
title: Treasurer turnaround
employers_used:
  - employer: goldman-sachs
    date: '2026-05-01'
    question_kind: leadership
failure_signal: used in 2 rejected applications (observational, small sample)
---
## Raw notes
Club was 800 quid in the red.
`,
      "USER",
    );

    await distillOutcomes("u1", deps);

    const story = await svc.read("u1", "stories/treasurer.md");
    expect(story!.content).not.toContain("failure_signal");
    expect(story!.content).toContain("strength_signal: high");
  });

  it("frontmatter dates survive the round-trip as YYYY-MM-DD (no ISO drift)", async () => {
    const { svc, deps } = setup([
      { employerName: "Goldman Sachs", status: "REJECTED" },
      { employerName: "Goldman Sachs", status: "REJECTED" },
    ]);
    await svc.list("u1");
    // date is UNQUOTED, so gray-matter parses it as a JS Date
    await svc.write(
      "u1",
      "stories/treasurer.md",
      `---
title: Treasurer turnaround
last_confirmed: 2026-06-01
employers_used:
  - employer: goldman-sachs
    date: 2026-05-01
    question_kind: leadership
---
## Raw notes
Notes.
`,
      "USER",
    );

    await distillOutcomes("u1", deps);

    const story = await svc.read("u1", "stories/treasurer.md");
    expect(story!.content).toContain("2026-05-01");
    expect(story!.content).toContain("2026-06-01");
    expect(story!.content).not.toContain("T00:00:00");
  });

  it("a malformed story file does not abort processing of other stories", async () => {
    const { svc, deps } = setup([
      { employerName: "Goldman Sachs", status: "REJECTED" },
      { employerName: "Goldman Sachs", status: "REJECTED" },
    ]);
    await svc.list("u1");
    await svc.write(
      "u1",
      "stories/bad.md",
      `---
broken: [unclosed, sequence
---
## Raw notes
Bad yaml above.
`,
      "USER",
    );
    await svc.write(
      "u1",
      "stories/zz-good.md",
      `---
title: Good story
employers_used:
  - employer: goldman-sachs
    date: '2026-05-01'
    question_kind: leadership
---
## Raw notes
Good story notes.
`,
      "USER",
    );

    await distillOutcomes("u1", deps);

    const good = await svc.read("u1", "stories/zz-good.md");
    expect(good!.content).toContain("used in 2 rejected applications");
  });
});
