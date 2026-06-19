import { describe, expect, it } from "vitest";

import {
  PRICE_TABLE,
  costFor,
  passRate,
  pairwiseScore,
  decideGate,
  type ArmStats,
} from "@/eval/gate";

/**
 * Pure gate-logic tests — no network, synthetic inputs only. This is the logic
 * that GATES a later cheap-model down-route: a candidate model only passes if it
 * is not-worse on quality (grader pass-rate within tolerance AND pairwise
 * not-worse) — cost is reported but never lets a worse model through.
 */

describe("PRICE_TABLE (indicative $/Mtok)", () => {
  it("has the incumbent Claude ids and at least one candidate", () => {
    expect(PRICE_TABLE["claude-sonnet-4-6"]).toBeDefined();
    expect(PRICE_TABLE["claude-haiku-4-5"]).toBeDefined();
    // input + output rates are positive numbers
    for (const id of Object.keys(PRICE_TABLE)) {
      expect(PRICE_TABLE[id].inputPerMtok).toBeGreaterThan(0);
      expect(PRICE_TABLE[id].outputPerMtok).toBeGreaterThan(0);
    }
  });
});

describe("costFor — token usage × indicative price", () => {
  it("computes input+output cost in USD for a known model", () => {
    // Sonnet indicative: $3 in / $15 out per Mtok (documented as indicative).
    const cost = costFor("claude-sonnet-4-6", { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(PRICE_TABLE["claude-sonnet-4-6"].inputPerMtok + PRICE_TABLE["claude-sonnet-4-6"].outputPerMtok, 6);
  });

  it("scales linearly with tokens", () => {
    const a = costFor("claude-haiku-4-5", { inputTokens: 500_000, outputTokens: 250_000 });
    const b = costFor("claude-haiku-4-5", { inputTokens: 1_000_000, outputTokens: 500_000 });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b!).toBeCloseTo(a! * 2, 6);
  });

  it("returns null for an unknown model id (cost cannot be asserted)", () => {
    expect(costFor("mystery/model", { inputTokens: 100, outputTokens: 100 })).toBeNull();
  });
});

describe("passRate — fraction of grader-passed drafts", () => {
  it("is the share of true verdicts", () => {
    expect(passRate([true, true, false, false])).toBe(0.5);
    expect(passRate([true, true, true])).toBe(1);
    expect(passRate([false, false])).toBe(0);
  });

  it("returns 0 for an empty set (no evidence ⇒ no credit)", () => {
    expect(passRate([])).toBe(0);
  });
});

describe("pairwiseScore — blind A/B from the FIXED Claude judge", () => {
  it("nets candidate wins minus incumbent wins, ties ignored", () => {
    // 3 candidate wins, 1 incumbent win, 1 tie ⇒ +2
    expect(pairwiseScore({ candidateWins: 3, incumbentWins: 1, ties: 1 })).toBe(2);
  });

  it("is negative when the incumbent wins more", () => {
    expect(pairwiseScore({ candidateWins: 1, incumbentWins: 4, ties: 0 })).toBe(-3);
  });
});

describe("decideGate — PASS only if quality not-worse", () => {
  const incumbent: ArmStats = {
    modelId: "claude-sonnet-4-6",
    graderPasses: [true, true, true, false], // pass-rate 0.75
    usage: { inputTokens: 2_000_000, outputTokens: 1_000_000 },
  };

  it("PASSES a cheaper candidate that matches quality within tolerance and is pairwise not-worse", () => {
    const candidate: ArmStats = {
      modelId: "claude-haiku-4-5",
      graderPasses: [true, true, true, false], // 0.75, equal
      usage: { inputTokens: 2_000_000, outputTokens: 1_000_000 },
    };
    const verdict = decideGate({
      incumbent,
      candidate,
      pairwise: { candidateWins: 2, incumbentWins: 2, ties: 1 }, // net 0 ⇒ not-worse
      tolerance: 0.05,
    });
    expect(verdict.pass).toBe(true);
    expect(verdict.incumbentPassRate).toBe(0.75);
    expect(verdict.candidatePassRate).toBe(0.75);
    // Cost is reported; candidate (Haiku) is cheaper than incumbent (Sonnet).
    expect(verdict.candidateCostUsd).not.toBeNull();
    expect(verdict.incumbentCostUsd).not.toBeNull();
    expect(verdict.candidateCostUsd!).toBeLessThan(verdict.incumbentCostUsd!);
    expect(verdict.cheaper).toBe(true);
  });

  it("FAILS a candidate whose grader pass-rate drops more than tolerance, even if far cheaper", () => {
    const candidate: ArmStats = {
      modelId: "claude-haiku-4-5",
      graderPasses: [true, false, false, false], // 0.25, well below 0.75
      usage: { inputTokens: 1_000, outputTokens: 1_000 }, // basically free
    };
    const verdict = decideGate({
      incumbent,
      candidate,
      pairwise: { candidateWins: 0, incumbentWins: 4, ties: 0 },
      tolerance: 0.05,
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((r) => /pass-rate|quality/i.test(r))).toBe(true);
  });

  it("FAILS a candidate that ties on pass-rate but LOSES the pairwise blind A/B", () => {
    const candidate: ArmStats = {
      modelId: "claude-haiku-4-5",
      graderPasses: [true, true, true, false], // equal 0.75
      usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
    };
    const verdict = decideGate({
      incumbent,
      candidate,
      pairwise: { candidateWins: 1, incumbentWins: 3, ties: 0 }, // net -2 ⇒ worse
      tolerance: 0.05,
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((r) => /pairwise/i.test(r))).toBe(true);
  });

  it("PASSES when the candidate is within tolerance below incumbent (small slip allowed)", () => {
    const tightIncumbent: ArmStats = {
      modelId: "claude-sonnet-4-6",
      graderPasses: new Array(20).fill(true), // 1.0
      usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
    };
    const candidate: ArmStats = {
      modelId: "claude-haiku-4-5",
      graderPasses: [...new Array(19).fill(true), false], // 0.95, exactly tolerance
      usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
    };
    const verdict = decideGate({
      incumbent: tightIncumbent,
      candidate,
      pairwise: { candidateWins: 0, incumbentWins: 0, ties: 20 }, // all ties ⇒ not-worse
      tolerance: 0.05,
    });
    expect(verdict.pass).toBe(true);
  });

  it("FAILS just past tolerance (0.06 slip > 0.05 tolerance)", () => {
    const tightIncumbent: ArmStats = {
      modelId: "claude-sonnet-4-6",
      graderPasses: new Array(100).fill(true), // 1.0
      usage: { inputTokens: 1, outputTokens: 1 },
    };
    const candidate: ArmStats = {
      modelId: "claude-haiku-4-5",
      graderPasses: [...new Array(94).fill(true), ...new Array(6).fill(false)], // 0.94
      usage: { inputTokens: 1, outputTokens: 1 },
    };
    const verdict = decideGate({
      incumbent: tightIncumbent,
      candidate,
      pairwise: { candidateWins: 10, incumbentWins: 0, ties: 90 },
      tolerance: 0.05,
    });
    expect(verdict.pass).toBe(false);
  });

  it("reports a null cost (and flags it) when the candidate model has no price entry", () => {
    const candidate: ArmStats = {
      modelId: "vendor/unpriced-model",
      graderPasses: [true, true, true, false],
      usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
    };
    const verdict = decideGate({
      incumbent,
      candidate,
      pairwise: { candidateWins: 2, incumbentWins: 2, ties: 0 },
      tolerance: 0.05,
    });
    expect(verdict.candidateCostUsd).toBeNull();
    // Quality is not-worse so the gate still PASSES; cost is informational only.
    expect(verdict.pass).toBe(true);
    expect(verdict.cheaper).toBeNull(); // cannot compare cost without a price
  });
});
