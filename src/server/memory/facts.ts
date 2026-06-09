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
  if (v === "volatile" && ageDays > 30) return "low";
  if (v === "stable" && ageDays > 180) return downgrade(f.confidence);
  return f.confidence;
}

export function volatilityFor(path: string): Volatility {
  return path === "strategy.md" ? "volatile" : "stable";
}
