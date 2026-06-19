/**
 * eval/gate.ts — the PURE, unit-tested decision logic for the
 * incumbent-Claude-vs-candidate writing eval (scripts/eval-writing.ts).
 *
 * This module is the GATE that a later, separately user-approved cheap-model
 * down-route must clear. It contains no I/O and no network: the eval script
 * runs both arms on the same engine path, collects each arm's grader verdicts +
 * token usage + the blind pairwise A/B tally, and passes synthetic-or-real
 * numbers into `decideGate`. Keeping it pure makes the ship/no-ship rule
 * testable WITHOUT spending API credits (which the account currently lacks).
 *
 * Decision rule (conservative, quality-first):
 *   A candidate PASSES iff
 *     (a) its grader pass-rate is within `tolerance` of the incumbent's
 *         (a small slip is allowed; a larger drop fails), AND
 *     (b) it is pairwise NOT-WORSE on the blind A/B judged by the FIXED
 *         frontier Claude (candidate wins ≥ incumbent wins).
 *   Cost is computed and REPORTED but never lets a worse model through.
 */

/** Indicative public list prices (USD per 1M tokens). NOT a billing source. */
export type Price = { inputPerMtok: number; outputPerMtok: number };

/**
 * Indicative per-model $/Mtok. These are approximate published list prices used
 * ONLY to order arms by cost in the report — they are explicitly indicative, not
 * a source of truth for billing, and may drift from current vendor pricing.
 */
export const PRICE_TABLE: Record<string, Price> = {
  // Anthropic Claude (incumbents)
  "claude-sonnet-4-6": { inputPerMtok: 3, outputPerMtok: 15 },
  "claude-haiku-4-5": { inputPerMtok: 1, outputPerMtok: 5 },
  // A few illustrative gateway candidates (indicative; extend as needed).
  "openai/gpt-4o-mini": { inputPerMtok: 0.15, outputPerMtok: 0.6 },
  "openai/gpt-4.1-mini": { inputPerMtok: 0.4, outputPerMtok: 1.6 },
  "google/gemini-2.0-flash": { inputPerMtok: 0.1, outputPerMtok: 0.4 },
};

/** Raw token usage for an arm across all eval questions. */
export type Usage = { inputTokens: number; outputTokens: number };

/** Everything the gate needs about ONE arm (incumbent or candidate). */
export type ArmStats = {
  modelId: string;
  /** One boolean per question: did the real grader.ts rubric PASS that arm's draft? */
  graderPasses: boolean[];
  usage: Usage;
};

/** Blind pairwise A/B tally from the FIXED Claude judge (never the candidate). */
export type Pairwise = { candidateWins: number; incumbentWins: number; ties: number };

export type GateInput = {
  incumbent: ArmStats;
  candidate: ArmStats;
  pairwise: Pairwise;
  /** Max allowed drop in grader pass-rate (e.g. 0.05). Default 0.05. */
  tolerance?: number;
};

export type GateVerdict = {
  pass: boolean;
  incumbentPassRate: number;
  candidatePassRate: number;
  /** candidate − incumbent (negative ⇒ a slip). */
  passRateDelta: number;
  pairwiseNet: number;
  incumbentCostUsd: number | null;
  candidateCostUsd: number | null;
  /** true/false when both costs known; null when candidate has no price entry. */
  cheaper: boolean | null;
  reasons: string[];
};

/** Total USD cost for an arm; null when the model id has no indicative price. */
export function costFor(modelId: string, usage: Usage): number | null {
  const price = PRICE_TABLE[modelId];
  if (!price) return null;
  return (
    (usage.inputTokens / 1_000_000) * price.inputPerMtok +
    (usage.outputTokens / 1_000_000) * price.outputPerMtok
  );
}

/** Fraction of drafts the grader passed. Empty ⇒ 0 (no evidence earns no credit). */
export function passRate(passes: boolean[]): number {
  if (passes.length === 0) return 0;
  return passes.filter(Boolean).length / passes.length;
}

/** Net pairwise margin for the candidate: wins − losses (ties ignored). */
export function pairwiseScore(p: Pairwise): number {
  return p.candidateWins - p.incumbentWins;
}

/**
 * Decide whether the candidate clears the gate. Quality-first and conservative:
 * a cost win NEVER overrides a quality loss.
 */
export function decideGate(input: GateInput): GateVerdict {
  const tolerance = input.tolerance ?? 0.05;
  const incumbentPassRate = passRate(input.incumbent.graderPasses);
  const candidatePassRate = passRate(input.candidate.graderPasses);
  const passRateDelta = candidatePassRate - incumbentPassRate;
  const pairwiseNet = pairwiseScore(input.pairwise);

  const incumbentCostUsd = costFor(input.incumbent.modelId, input.incumbent.usage);
  const candidateCostUsd = costFor(input.candidate.modelId, input.candidate.usage);
  const cheaper =
    incumbentCostUsd === null || candidateCostUsd === null
      ? null
      : candidateCostUsd < incumbentCostUsd;

  const reasons: string[] = [];

  // (a) grader pass-rate must not slip beyond tolerance.
  // (candidate ahead, equal, or within tolerance below incumbent all OK.) The
  // tolerance boundary is INCLUSIVE; a tiny epsilon absorbs float error from
  // ratio subtraction (e.g. 0.95 − 1.0 = −0.05000000000000004) so an exactly-on-
  // tolerance slip still passes rather than failing on a rounding artefact.
  const EPSILON = 1e-9;
  const qualityOk = passRateDelta >= -tolerance - EPSILON;
  if (!qualityOk) {
    reasons.push(
      `grader pass-rate dropped ${(-passRateDelta * 100).toFixed(1)}% (candidate ${(
        candidatePassRate * 100
      ).toFixed(1)}% vs incumbent ${(incumbentPassRate * 100).toFixed(1)}%), exceeding the ${(
        tolerance * 100
      ).toFixed(1)}% tolerance`,
    );
  }

  // (b) pairwise blind A/B must be not-worse (candidate wins ≥ incumbent wins).
  const pairwiseOk = pairwiseNet >= 0;
  if (!pairwiseOk) {
    reasons.push(
      `pairwise blind A/B worse (candidate net ${pairwiseNet}: ${input.pairwise.candidateWins} win / ${input.pairwise.incumbentWins} loss / ${input.pairwise.ties} tie)`,
    );
  }

  const pass = qualityOk && pairwiseOk;
  if (pass) {
    reasons.push(
      cheaper === true
        ? "PASS: quality not-worse and candidate is cheaper"
        : cheaper === false
          ? "PASS on quality, but candidate is NOT cheaper (no economic reason to switch)"
          : "PASS on quality; candidate cost unknown (no price entry)",
    );
  }

  return {
    pass,
    incumbentPassRate,
    candidatePassRate,
    passRateDelta,
    pairwiseNet,
    incumbentCostUsd,
    candidateCostUsd,
    cheaper,
    reasons,
  };
}
