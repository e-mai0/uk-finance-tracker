import { parseFactLine } from "@/server/memory/facts";

/**
 * Memory recall tuning — relevance ordering + edge-placement (NO embeddings).
 *
 * Research-backed design constraint: at our scale (dozens–hundreds of facts)
 * full-load is correct. This module ONLY reorders WHOLE FILES by relevance to
 * the current user message so the most-relevant memory lands at the EDGES (top
 * and bottom) of the injected block — mitigating "lost in the middle". It NEVER
 * edits a file's internal lines (so section structure and "## Raw notes" blocks
 * stay intact) and NEVER drops a fact. On ANY error it degrades to today's
 * behavior: straight concatenation in the original order.
 *
 * The unit of reordering is the file, not the line: this is the single safest
 * way to guarantee both invariants — internal structure is preserved verbatim
 * because lines are never touched, and no fact can be lost because each file is
 * emitted exactly once. The injected output is therefore a permutation of the
 * input files, never a superset/subset of facts.
 */

export type CoreFile = { path: string; content: string };

/** Today's CURRENT behavior: wrap each file and concatenate in the given order. */
function concatFiles(files: CoreFile[]): string {
  return files.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join("\n");
}

/** Lowercase alphanumeric terms of length ≥ 3, deduped. Stopwords removed. */
const STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "with", "this", "that", "what", "how",
  "are", "was", "but", "not", "can", "should", "would", "could", "about",
  "any", "all", "have", "has", "had", "from", "into", "out", "get", "got",
  "tell", "help", "need", "want", "like", "they", "them", "there", "their",
  "confidence", "confirmed", "high", "medium", "low",
]);

export function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

/** Recency weight in [0,1): newer `confirmed` dates score higher. */
function recencyScore(confirmed: string, now: Date): number {
  const t = new Date(confirmed).getTime();
  if (!Number.isFinite(t)) return 0;
  const ageDays = (now.getTime() - t) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 0) return 1;
  // Smooth decay: ~1.0 today → ~0.5 at 180 days → →0.
  return 1 / (1 + ageDays / 180);
}

/** Term-overlap relevance for one fact line against the message terms. */
function lineOverlap(lineText: string, messageTerms: Set<string>): number {
  if (messageTerms.size === 0) return 0;
  let hits = 0;
  for (const term of tokenize(lineText)) {
    if (messageTerms.has(term)) hits += 1;
  }
  return hits;
}

/**
 * Rank fact LINES by relevance to `message` (term overlap first, recency as the
 * tiebreak). Pure helper exposed for digest/testing. Non-fact lines are ranked
 * with overlap computed on their raw text and recency 0. Stable for equal keys.
 */
export function rankFactLines(lines: string[], message: string, now: Date): string[] {
  const terms = tokenize(message);
  return lines
    .map((line, i) => {
      const fact = parseFactLine(line);
      const overlap = lineOverlap(fact ? fact.text : line, terms);
      const recency = fact ? recencyScore(fact.confirmed, now) : 0;
      return { line, i, overlap, recency };
    })
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      if (b.recency !== a.recency) return b.recency - a.recency;
      return a.i - b.i; // stable
    })
    .map((x) => x.line);
}

/** Aggregate a file's relevance: best line overlap dominates, recency breaks ties. */
function scoreFile(file: CoreFile, message: string, now: Date): { overlap: number; recency: number } {
  const terms = tokenize(message);
  let overlap = 0;
  let recency = 0;
  for (const line of file.content.split("\n")) {
    const fact = parseFactLine(line);
    const o = lineOverlap(fact ? fact.text : line, terms);
    if (o > overlap) overlap = o;
    if (fact) {
      const r = recencyScore(fact.confirmed, now);
      if (r > recency) recency = r;
    }
  }
  return { overlap, recency };
}

/**
 * Arrange files by relevance with EDGE PLACEMENT: the most-relevant file goes to
 * the TOP, the second-most-relevant to the BOTTOM, and the remainder fill the
 * middle (descending). Beats "lost in the middle" by putting the strongest
 * signal where the model attends best — the two ends.
 *
 * Returns a permutation of `files` (every file exactly once).
 */
function edgeArrange(ranked: CoreFile[]): CoreFile[] {
  if (ranked.length <= 2) return ranked;
  const [top, bottom, ...middle] = ranked;
  return [top, ...middle, bottom];
}

/**
 * Core entry point with an injectable ranker (for fault-injection testing).
 * On ANY throw from the ranker — or any other error — falls back to the
 * original-order concatenation (today's behavior). Never throws.
 */
function buildWithRanker(
  files: CoreFile[],
  message: string,
  rank: (files: CoreFile[], message: string) => CoreFile[],
): string {
  try {
    // Degenerate cases: nothing to reorder → identical to legacy behavior.
    if (files.length <= 1) return concatFiles(files);
    if (!message || !message.trim()) return concatFiles(files);

    const ordered = rank(files, message);

    // Safety: the ranker MUST return a permutation. If it dropped, duplicated,
    // or invented a file, discard its output and fall back to legacy order —
    // the "never drop a fact" invariant takes absolute priority over ordering.
    const sameSet =
      ordered.length === files.length &&
      new Set(ordered).size === files.length &&
      ordered.every((f) => files.includes(f));
    if (!sameSet) return concatFiles(files);

    return concatFiles(ordered);
  } catch {
    return concatFiles(files);
  }
}

/** Default relevance ranker: sort files by (overlap, recency) desc, then edge-arrange. */
function defaultRank(files: CoreFile[], message: string): CoreFile[] {
  const now = new Date();
  const scored = files.map((f, i) => ({ f, i, ...scoreFile(f, message, now) }));
  scored.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    if (b.recency !== a.recency) return b.recency - a.recency;
    return a.i - b.i; // stable: preserve original order on full ties
  });
  return edgeArrange(scored.map((s) => s.f));
}

/**
 * Build the memory section to inject. Relevance-orders whole files and places
 * the most-relevant at the edges; preserves every file's internal structure and
 * never drops a fact; falls back to today's straight concatenation on any error
 * or degenerate input.
 */
export function buildRecallMemory(files: CoreFile[], message: string): string {
  return buildWithRanker(files, message, defaultRank);
}

/** Test-only hooks (fault injection + internals). Not for production callers. */
export const __test__ = { buildWithRanker, concatFiles, scoreFile, edgeArrange };
