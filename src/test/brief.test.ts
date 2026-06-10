import { describe, expect, it } from "vitest";
import { composeBrief, type BriefData } from "@/server/brief/compose";

const TODAY = "2026-06-10";

const EMPTY: BriefData = {
  deadlines: [],
  refreshed: [],
  gardenerQuestions: [],
  staleApps: [],
};

describe("composeBrief", () => {
  it("returns null when every section is empty", () => {
    expect(composeBrief(EMPTY, TODAY)).toBeNull();
  });

  it("lists a deadline within 3 days under the urgent heading", () => {
    const out = composeBrief(
      {
        ...EMPTY,
        deadlines: [
          { employer: "Acme", title: "Grad scheme", deadlineAt: "2026-06-12" },
        ],
      },
      TODAY,
    );
    expect(out).toContain("## Deadlines in the next 3 days");
    expect(out).toContain("- Acme - Grad scheme (due 2026-06-12)");
  });

  it("keeps past-due deadlines in the urgent section (most urgent of all)", () => {
    const out = composeBrief(
      {
        ...EMPTY,
        deadlines: [
          { employer: "Acme", title: "Grad scheme", deadlineAt: "2026-06-08" },
        ],
      },
      TODAY,
    );
    expect(out).toContain("## Deadlines in the next 3 days");
    expect(out).toContain("- Acme - Grad scheme (due 2026-06-08)");
  });

  it("lists a deadline 4-7 days out under Later this week, not under the urgent heading", () => {
    const out = composeBrief(
      {
        ...EMPTY,
        deadlines: [
          { employer: "Globex", title: "Analyst", deadlineAt: "2026-06-15" },
        ],
      },
      TODAY,
    );
    expect(out).toContain("## Later this week");
    expect(out).toContain("- Globex - Analyst (due 2026-06-15)");
    expect(out).not.toContain("## Deadlines in the next 3 days");
  });

  it("buckets a full ISO datetime exactly 3 calendar days out as urgent", () => {
    const out = composeBrief(
      {
        ...EMPTY,
        deadlines: [
          { employer: "Acme", title: "Grad scheme", deadlineAt: "2026-06-13T23:00:00Z" },
        ],
      },
      TODAY,
    );
    expect(out).toContain("## Deadlines in the next 3 days");
    expect(out).toContain("- Acme - Grad scheme (due 2026-06-13)");
    expect(out).not.toContain("## Later this week");
  });

  it("buckets a full ISO datetime exactly 7 calendar days out under Later this week", () => {
    const out = composeBrief(
      {
        ...EMPTY,
        deadlines: [
          { employer: "Globex", title: "Analyst", deadlineAt: "2026-06-17T23:00:00Z" },
        ],
      },
      TODAY,
    );
    expect(out).toContain("## Later this week");
    expect(out).toContain("- Globex - Analyst (due 2026-06-17)");
    expect(out).not.toContain("## Deadlines in the next 3 days");
  });

  it("omits a deadline 8 calendar days out from both deadline sections", () => {
    const out = composeBrief(
      {
        ...EMPTY,
        deadlines: [
          { employer: "Initech", title: "Intern", deadlineAt: "2026-06-18T23:00:00Z" },
        ],
      },
      TODAY,
    );
    expect(out).toBeNull();
  });

  it("lists refreshed employer names under Research warmed overnight", () => {
    const out = composeBrief(
      { ...EMPTY, refreshed: ["Acme", "Globex"] },
      TODAY,
    );
    expect(out).toContain("## Research warmed overnight");
    expect(out).toContain("- Acme");
    expect(out).toContain("- Globex");
  });

  it("quotes the first pending gardener question with an (and N more) count", () => {
    const one = composeBrief(
      { ...EMPTY, gardenerQuestions: ["Do you have a driving licence?"] },
      TODAY,
    );
    expect(one).toContain("## Quick check");
    expect(one).toContain("Do you have a driving licence?");
    expect(one).not.toContain("(and");

    const many = composeBrief(
      {
        ...EMPTY,
        gardenerQuestions: [
          "Do you have a driving licence?",
          "What is your notice period?",
          "Are you happy to relocate?",
        ],
      },
      TODAY,
    );
    expect(many).toContain("## Quick check (and 2 more)");
    expect(many).toContain("Do you have a driving licence?");
    expect(many).not.toContain("What is your notice period?");
  });

  it("lists stale apps with employer, role, status, and days quiet", () => {
    const out = composeBrief(
      {
        ...EMPTY,
        staleApps: [
          { employer: "Acme", role: "Engineer", status: "APPLIED", daysSince: 12 },
        ],
      },
      TODAY,
    );
    expect(out).toContain("## Applications going quiet");
    expect(out).toContain("- Acme Engineer: applied for 12 days");
  });

  it("starts with the dated header and contains no em dash", () => {
    const out = composeBrief(
      {
        deadlines: [
          { employer: "Acme", title: "Grad scheme", deadlineAt: "2026-06-11" },
          { employer: "Globex", title: "Analyst", deadlineAt: "2026-06-16" },
        ],
        refreshed: ["Initech"],
        gardenerQuestions: ["Do you have a driving licence?"],
        staleApps: [
          { employer: "Hooli", role: "PM", status: "INTERVIEW", daysSince: 9 },
        ],
      },
      TODAY,
    );
    expect(out).not.toBeNull();
    expect(out!.startsWith(`# Morning brief - ${TODAY}`)).toBe(true);
    expect(out).not.toContain(String.fromCharCode(0x2014));
  });
});
