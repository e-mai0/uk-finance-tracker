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
    expect(cv.fullName).toBe("Eric Mai");
    expect(cv.education[0].institution).toBe("University of Cambridge");
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
    expect(cv.fullName).toBe("Eric Mai");
    expect(cv.education[0].institution).toBe("University of Cambridge");
  });
});
