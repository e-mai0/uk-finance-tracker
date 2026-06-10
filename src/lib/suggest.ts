import { parseFactLine } from "@/server/memory/facts";
import { questionSimilarity } from "@/lib/answers";

export type Suggestion = {
  label: string;
  value: string;
  source: "memory" | "bank";
  confidence: "high" | "medium" | "low";
};

const FACT_LABEL_THRESHOLD = 0.5;
const BANK_THRESHOLD = 0.5;

/**
 * Suggest values for unanswered ask labels from profile.md fact lines
 * (format "- <label>: <value> (confidence: ..., confirmed: ...)") and the
 * answer bank. Memory facts win over bank answers. One suggestion per label.
 *
 * questionSimilarity takes raw strings and normalizes internally — no
 * pre-normalisation needed here.
 */
export function suggestForLabels(
  labels: string[],
  profileFactLines: string[],
  bankItems: { questionText: string; answer: string }[],
): Suggestion[] {
  const facts = profileFactLines
    .map(parseFactLine)
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .map((f) => {
      const idx = f.text.indexOf(":");
      if (idx === -1) return null;
      return {
        label: f.text.slice(0, idx).trim(),
        value: f.text.slice(idx + 1).trim(),
        confidence: f.confidence,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const out: Suggestion[] = [];
  for (const label of labels) {
    let best: Suggestion | null = null;
    let bestScore = 0;

    // Memory facts take priority
    for (const f of facts) {
      const score = questionSimilarity(label, f.label);
      if (score >= FACT_LABEL_THRESHOLD && score > bestScore) {
        best = { label, value: f.value, source: "memory", confidence: f.confidence };
        bestScore = score;
      }
    }

    // Fall back to answer bank
    if (!best) {
      for (const item of bankItems) {
        const score = questionSimilarity(label, item.questionText);
        if (score >= BANK_THRESHOLD && score > bestScore) {
          best = { label, value: item.answer, source: "bank", confidence: "medium" };
          bestScore = score;
        }
      }
    }

    if (best) out.push(best);
  }
  return out;
}
