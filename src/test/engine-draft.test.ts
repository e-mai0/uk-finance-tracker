import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({ generateText: mocks.generateText }));

import { draftText } from "@/server/engine/draft";
import type { DraftContext } from "@/server/engine/types";

const CTX: DraftContext = {
  profile: {
    name: "Eric",
    university: "LSE",
    degree: "Economics",
    graduationYear: 2027,
    skills: ["Excel"],
    cvText: "CV TEXT HERE",
    workAuthStatement: null,
  },
  voice: { bannedTells: [], traits: ["- Short openings"], exemplars: "> Honest answer." },
  stories: [
    {
      path: "stories/rowing.md",
      slug: "rowing",
      title: "Rowing turnaround",
      themes: ["leadership", "pressure"],
      employersUsed: [],
      strengthSignal: "high",
      failureSignal: null,
      timeline: "2024",
      rawNotes: "800 quid deficit, rebuilt the budget",
      finalVersions: "",
    },
  ],
  companyNotes: "Spoke to an analyst at the spring event.",
  research: "Barclays: markets division news...",
  pastAnswers: [{ question: "teamwork q", excerpt: "old answer" }],
};

describe("draftText", () => {
  it("grounds leadership questions in a selected story and reports provenance", async () => {
    mocks.generateText.mockResolvedValueOnce({ text: "I fixed an 800 pound hole in the budget.", usage: { totalTokens: 100 } });
    const out = await draftText("u1", CTX, {
      kind: "ANSWER",
      question: "Tell us about a time you led under pressure",
      employerName: "Barclays",
      employerSlug: "barclays",
      charLimit: 800,
    });
    const prompt = mocks.generateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("800 quid deficit");
    expect(prompt).toContain("Barclays: markets division news");
    expect(prompt).toContain("Spoke to an analyst");
    expect(out.provenance.storiesUsed).toEqual(["rowing"]);
    expect(out.provenance.researchUsed).toBe(true);
    expect(out.provenance.questionKind).toBe("leadership");
  });

  it("enforces the char limit at a sentence boundary", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "First sentence here. Second sentence is long and pushes past the cap easily.",
      usage: {},
    });
    const out = await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?", charLimit: 30 });
    expect(out.text).toBe("First sentence here.");
    expect(out.text.length).toBeLessThanOrEqual(30);
  });

  it("includes voice exemplars and banned-tells instructions in the system prompt", async () => {
    mocks.generateText.mockResolvedValueOnce({ text: "ok", usage: {} });
    await draftText("u1", CTX, { kind: "ANSWER", question: "Why Barclays?" });
    const system = mocks.generateText.mock.calls.at(-1)![0].system as string;
    expect(system).toContain("Honest answer.");
    expect(system).toContain("em dash");
    expect(system).toContain("never invent");
  });
});
