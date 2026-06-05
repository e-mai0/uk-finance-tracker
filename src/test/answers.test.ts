import { describe, it, expect } from "vitest";
import {
  normalizeQuestion,
  questionSimilarity,
  bestAnswerMatch,
} from "../lib/answers";

describe("normalizeQuestion", () => {
  it("strips punctuation, stopwords and order", () => {
    const a = normalizeQuestion("Why do you want to work at Goldman Sachs?");
    const b = normalizeQuestion("work Goldman Sachs want");
    expect(a).toBe(b);
  });

  it("is deterministic and case-insensitive", () => {
    expect(normalizeQuestion("Tell us about YOURSELF")).toBe(
      normalizeQuestion("tell us about yourself"),
    );
  });

  it("returns empty string for all-stopword input", () => {
    expect(normalizeQuestion("why do you")).toBe("");
  });
});

describe("questionSimilarity", () => {
  it("scores near-identical phrasings of a question highly", () => {
    const s = questionSimilarity(
      "Why do you want to work at this firm?",
      "Why would you want to work at the firm?",
    );
    expect(s).toBeGreaterThan(0.9);
  });

  it("scores reworded-but-related questions in the middle", () => {
    const s = questionSimilarity(
      "What motivates you to pursue investment banking?",
      "Why do you want to work in investment banking?",
    );
    expect(s).toBeGreaterThan(0.2);
    expect(s).toBeLessThan(0.6);
  });

  it("scores unrelated questions low", () => {
    const s = questionSimilarity(
      "What is your expected graduation date?",
      "Describe a time you showed leadership.",
    );
    expect(s).toBeLessThan(0.2);
  });

  it("is 1 for identical content words", () => {
    expect(questionSimilarity("greatest achievement", "your greatest achievement")).toBe(1);
  });

  it("is 0 when either side has no content words", () => {
    expect(questionSimilarity("why do you", "leadership example")).toBe(0);
  });
});

describe("bestAnswerMatch", () => {
  const bank = [
    { questionText: "Why do you want to work in investment banking?", answer: "A1" },
    { questionText: "Describe your greatest achievement.", answer: "A2" },
  ];

  it("returns the closest item above threshold", () => {
    const m = bestAnswerMatch(
      bank,
      "Do you want to work in investment banking?",
      0.6,
    );
    expect(m?.item.answer).toBe("A1");
  });

  it("returns null when nothing clears the threshold", () => {
    const m = bestAnswerMatch(bank, "What is your notice period?", 0.6);
    expect(m).toBeNull();
  });

  it("picks the higher-scoring of two candidates", () => {
    const m = bestAnswerMatch(
      [
        { questionText: "greatest achievement", answer: "exact" },
        { questionText: "greatest professional achievement to date", answer: "looser" },
      ],
      "your greatest achievement",
      0.3,
    );
    expect(m?.item.answer).toBe("exact");
  });
});
