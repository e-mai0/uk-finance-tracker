/**
 * Pure helpers for the answer bank — normalizing application questions and
 * finding the closest previously-answered question. No I/O, fully unit-tested.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "is", "are",
  "you", "your", "we", "our", "us", "do", "does", "did", "with", "at", "by",
  "this", "that", "these", "those", "as", "it", "be", "will", "would", "can",
  "please", "tell", "describe", "explain", "why", "what", "how", "which",
]);

/**
 * Normalize a question to a comparable key: lower-cased, punctuation stripped,
 * stopwords removed, tokens sorted. "Why do you want to work at X?" and
 * "What is your motivation for working at X" collapse toward a shared core.
 */
export function normalizeQuestion(raw: string): string {
  return Array.from(tokenize(raw)).sort().join(" ");
}

function tokenize(raw: string): Set<string> {
  const tokens = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return new Set(tokens);
}

/** Jaccard similarity over content-word token sets (0..1). */
export function questionSimilarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface BankCandidate {
  questionText: string;
  answer: string;
}

/**
 * Best answer-bank match for a new question, or null if nothing clears the
 * similarity threshold. Returns the matched item plus its score so callers can
 * decide whether to reuse verbatim or regenerate.
 */
export function bestAnswerMatch<T extends BankCandidate>(
  bank: T[],
  question: string,
  threshold = 0.6,
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const item of bank) {
    const score = questionSimilarity(item.questionText, question);
    if (score >= threshold && (!best || score > best.score)) {
      best = { item, score };
    }
  }
  return best;
}
