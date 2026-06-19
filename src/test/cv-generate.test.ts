// src/test/cv-generate.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/ai/budget", () => ({
  checkBudget: vi.fn(async () => ({ ok: true })),
  recordUsage: vi.fn(async () => {}),
}));

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({ generateText }));

import { parseCvTextToCvData, draftCvDataFromKnown, extractCvJson } from "@/server/cv/generate";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("parseCvTextToCvData (no API key)", () => {
  it("returns null when there is no API key", async () => {
    expect(await parseCvTextToCvData("u1", "Eric Mai\nCambridge")).toBeNull();
  });

  it("returns null for empty text", async () => {
    process.env.ANTHROPIC_API_KEY = "x";
    expect(await parseCvTextToCvData("u1", "   ")).toBeNull();
  });
});

describe("extractCvJson", () => {
  it("parses a plain JSON object", () => {
    expect(extractCvJson('{"fullName":"Eric"}')).toEqual({ fullName: "Eric" });
  });

  it("parses JSON wrapped in a ```json code fence", () => {
    expect(extractCvJson('```json\n{"fullName":"Eric"}\n```')).toEqual({ fullName: "Eric" });
  });

  it("parses JSON with surrounding prose", () => {
    expect(extractCvJson('Here is the CV:\n{"fullName":"Eric"}\nHope that helps!')).toEqual({
      fullName: "Eric",
    });
  });

  it("returns null when there is no object", () => {
    expect(extractCvJson("no json here")).toBeNull();
  });

  it("throws on malformed JSON inside braces (caller catches)", () => {
    expect(() => extractCvJson('{"fullName": }')).toThrow();
  });
});

describe("draftCvDataFromKnown (no API key → deterministic baseline)", () => {
  it("falls back to the deterministic baseline", async () => {
    const cv = await draftCvDataFromKnown("u1", {
      fullName: "Eric Mai",
      university: "University of Cambridge",
      degreeSubject: "Economics",
      degreeType: "BA",
      graduationYear: 2028,
      memoryFacts: [],
    });
    // No uploaded CV text → the from-scratch baseline path is unchanged (non-null).
    expect(cv).not.toBeNull();
    expect(cv!.fullName).toBe("Eric Mai");
    expect(cv!.education[0].institution).toBe("University of Cambridge");
  });
});

describe("draftCvDataFromKnown — uploaded CV present, draft fails → null (no clobber)", () => {
  // When the user has uploaded a CV, a transient draft failure must NOT return
  // the lossy baseline stub (which the action would persist over the rich CV).
  // It must return null so the action declines to persist.
  const known = {
    fullName: "Eric Mai",
    university: "University of Cambridge",
    degreeSubject: "Economics",
    degreeType: "BA",
    graduationYear: 2028,
    uploadedCvText: "Eric Mai\nDeloitte Spring Intern 2025\nLed a five-person valuation project.",
    memoryFacts: [],
  };

  it("returns null when there is no API key (rather than the stub baseline)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await draftCvDataFromKnown("u1", known)).toBeNull();
  });

  it("returns null when the budget is not ok", async () => {
    process.env.ANTHROPIC_API_KEY = "x";
    const { checkBudget } = await import("@/server/ai/budget");
    vi.mocked(checkBudget).mockResolvedValueOnce({ ok: false } as never);
    expect(await draftCvDataFromKnown("u1", known)).toBeNull();
  });

  it("returns null when the model output is malformed JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "x";
    generateText.mockResolvedValueOnce({ text: '{"fullName": }', usage: { totalTokens: 5 } });
    expect(await draftCvDataFromKnown("u1", known)).toBeNull();
  });

  it("still returns the parsed draft when the model succeeds (uploaded text present)", async () => {
    process.env.ANTHROPIC_API_KEY = "x";
    generateText.mockResolvedValueOnce({
      text: '{"fullName":"Eric Mai","experience":[{"org":"Deloitte","role":"Spring Intern","bullets":["Led valuation"]}]}',
      usage: { totalTokens: 50 },
    });
    const cv = await draftCvDataFromKnown("u1", known);
    expect(cv).not.toBeNull();
    expect(cv!.experience[0].org).toBe("Deloitte");
  });
});

describe("generateText → extractCvJson → safeParse wiring (mocked model)", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "x";
  });

  it("parseCvTextToCvData parses fenced JSON from the model into CvData", async () => {
    generateText.mockResolvedValueOnce({
      text: '```json\n{"fullName":"Eric Mai","experience":[{"org":"Deloitte","role":"Spring Intern","bullets":["One-week programme"]}],"skills":[{"label":"Technical","items":["Python"]}]}\n```',
      usage: { totalTokens: 120 },
    });
    const cv = await parseCvTextToCvData("u1", "Eric Mai — Deloitte Spring Intern");
    expect(cv).not.toBeNull();
    expect(cv!.fullName).toBe("Eric Mai");
    expect(cv!.experience[0].org).toBe("Deloitte");
    expect(cv!.skills[0].items).toContain("Python");
  });

  it("parseCvTextToCvData returns null when the model emits no JSON object", async () => {
    generateText.mockResolvedValueOnce({ text: "I cannot help with that.", usage: { totalTokens: 5 } });
    expect(await parseCvTextToCvData("u1", "some cv")).toBeNull();
  });

  it("draftCvDataFromKnown falls back to baseline when the model output is malformed", async () => {
    generateText.mockResolvedValueOnce({ text: '{"fullName": }', usage: { totalTokens: 5 } });
    const cv = await draftCvDataFromKnown("u1", {
      fullName: "Eric Mai",
      university: "University of Cambridge",
      degreeSubject: "Economics",
      degreeType: "BA",
      graduationYear: 2028,
      memoryFacts: [],
    });
    // No uploaded CV text → malformed output still falls back to the baseline (non-null).
    expect(cv).not.toBeNull();
    expect(cv!.fullName).toBe("Eric Mai");
    expect(cv!.education[0].institution).toBe("University of Cambridge");
  });
});
