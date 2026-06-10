import matter from "gray-matter";
import type { Story } from "@/server/engine/types";

/** Slugify an employer name the same way companies/<slug>.md paths are formed. */
export function employerSlugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function parseStory(path: string, content: string): Story | null {
  if (!content.startsWith("---")) return null;
  let data: Record<string, unknown>;
  let body: string;
  try {
    const parsed = matter(content);
    data = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch {
    return null;
  }
  if (!data.title) return null;

  const section = (name: string): string => {
    const m = body.match(new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "im"));
    return m ? m[1].trim() : "";
  };

  const employersUsed = Array.isArray(data.employers_used)
    ? (data.employers_used as Record<string, string>[]).map((e) => ({
        employer: String(e.employer ?? ""),
        date: e.date ? String(e.date) : undefined,
        question_kind: e.question_kind ? String(e.question_kind) : undefined,
      }))
    : [];

  return {
    path,
    slug: path.replace(/^stories\//, "").replace(/\.md$/, ""),
    title: String(data.title),
    themes: Array.isArray(data.themes) ? data.themes.map(String) : [],
    employersUsed,
    strengthSignal: data.strength_signal ? String(data.strength_signal) : null,
    failureSignal: data.failure_signal ? String(data.failure_signal) : null,
    timeline: data.timeline ? String(data.timeline) : "",
    rawNotes: section("Raw notes"),
    finalVersions: section("Final versions"),
  };
}

const KIND_RULES: [string, RegExp, string[]][] = [
  ["leadership", /\b(led|lead(?:ing|er)?|captain|organis|in charge)\b/i, ["leadership", "initiative"]],
  ["teamwork", /\b(team|collaborat|group|together)\b/i, ["teamwork"]],
  ["failure", /\b(fail(?:ure|ed|ing)?|mistake|setback|went wrong|didn'?t go)\b/i, ["failure"]],
  ["pressure", /\b(pressure|deadline|stress|difficult|challeng)\b/i, ["pressure"]],
  ["commercial", /\b(market|trend|news|commercial awareness|economy|deal)\b/i, []],
  ["motivation", /\b(why|motivat|interest(?:ed)? in|attract|apply(?:ing)? to)\b/i, []],
  ["strengths", /\b(strengths?|weakness|skill)\b/i, []],
  ["analysis", /\b(analys|problem|data|quantitative)\b/i, ["analysis"]],
  ["communication", /\b(communicat|persuad|explain|present)\b/i, ["communication"]],
];

export function classifyQuestion(question: string): { kind: string; themes: string[] } {
  for (const [kind, re, themes] of KIND_RULES) {
    if (re.test(question)) return { kind, themes };
  }
  return { kind: "general", themes: [] };
}

// Missing strength sorts as 2 (same as medium) so unrated stories aren't buried below low-rated ones.
const STRENGTH_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function selectStories(
  stories: Story[],
  opts: { themes: string[]; employerSlug?: string; max: number; excludeSlugs?: string[] },
): Story[] {
  if (!opts.themes.length) return [];
  return stories
    .filter((s) => s.themes.some((t) => opts.themes.includes(t)))
    .filter(
      (s) =>
        !opts.employerSlug ||
        !s.employersUsed.some((u) => employerSlugOf(u.employer) === opts.employerSlug),
    )
    .filter((s) => !opts.excludeSlugs?.includes(s.slug))
    .sort((a, b) => {
      const diff =
        (STRENGTH_ORDER[b.strengthSignal ?? ""] ?? 2) - (STRENGTH_ORDER[a.strengthSignal ?? ""] ?? 2);
      if (diff !== 0) return diff;
      return a.slug.localeCompare(b.slug);
    })
    .slice(0, opts.max);
}
