export type Confidence = "high" | "medium" | "low";
export type Volatility = "volatile" | "stable";

export type Fact = { text: string; confidence: Confidence; confirmed: string };

const FACT_RE =
  /^- (.+) \(confidence: (high|medium|low), confirmed: (\d{4}-\d{2}-\d{2})\)\s*$/;

export function parseFactLine(line: string): Fact | null {
  const m = line.match(FACT_RE);
  if (!m) return null;
  return { text: m[1], confidence: m[2] as Confidence, confirmed: m[3] };
}

export function formatFactLine(f: Fact): string {
  return `- ${f.text} (confidence: ${f.confidence}, confirmed: ${f.confirmed})`;
}

const ORDER: Confidence[] = ["low", "medium", "high"];

function downgrade(c: Confidence): Confidence {
  return ORDER[Math.max(0, ORDER.indexOf(c) - 1)];
}

export function effectiveConfidence(f: Fact, v: Volatility, now: Date): Confidence {
  const ageDays = (now.getTime() - new Date(f.confirmed).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays)) return "low";
  if (v === "volatile" && ageDays > 30) return "low";
  if (v === "stable" && ageDays > 180) return downgrade(f.confidence);
  return f.confidence;
}

export function volatilityFor(path: string): Volatility {
  return path === "strategy.md" ? "volatile" : "stable";
}

/**
 * Pure helper: given the current content of profile.md, a label/value pair,
 * and today's date string (YYYY-MM-DD), returns the updated content.
 *
 * - Collapses all whitespace in label and value to single spaces (injection guard).
 * - Strips any `(confidence:` substring from value (defense-in-depth).
 * - Uses a line-anchored regex so mid-line occurrences never trigger supersession.
 * - Returns `content` unchanged when the resulting line already exists verbatim (no-op).
 */
export function applyFact(
  content: string,
  label: string,
  value: string,
  today: string,
): string {
  // --- sanitize inputs ---
  const cleanLabel = label.replace(/\s+/g, " ").trim();
  const cleanValue = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\(confidence:/gi, "(c:");

  const line = `- ${cleanLabel}: ${cleanValue} (confidence: high, confirmed: ${today})`;

  // No-op if line already exists verbatim
  if (content.includes(line)) return content;

  const escapedLabel = cleanLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^- ${escapedLabel}:.*$`, "m");

  if (re.test(content)) {
    return content.replace(re, line);
  }
  return `${content.trimEnd()}\n${line}\n`;
}
