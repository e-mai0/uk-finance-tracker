import matter from "gray-matter";
import { employerSlugOf } from "@/server/engine/stories";
import { normalizeFrontmatterData } from "@/server/engine/frontmatter";

// ---------------------------------------------------------------------------
// Pure logic (exported for tests)
// ---------------------------------------------------------------------------

export interface UsageEntry {
  employer: string;
  date: string;
  question_kind: string;
}

/**
 * Pure: append a usage entry to the frontmatter `employers_used` array of a
 * story markdown file, deduplicating on employer+question_kind.
 * Returns the input unchanged on malformed frontmatter.
 */
export function appendUsage(storyContent: string, entry: UsageEntry): string {
  if (!storyContent.startsWith("---")) return storyContent;
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(storyContent);
  } catch {
    return storyContent;
  }

  // Normalize YAML-parsed Date values (e.g. an unquoted employers_used[].date)
  // back to YYYY-MM-DD strings so re-stringifying does not drift them into
  // ISO timestamps.
  const data = normalizeFrontmatterData(parsed.data as Record<string, unknown>);
  const existing: UsageEntry[] = Array.isArray(data.employers_used)
    ? (data.employers_used as Record<string, string>[]).map((e) => ({
        employer: String(e.employer ?? ""),
        date: String(e.date ?? ""),
        question_kind: String(e.question_kind ?? ""),
      }))
    : [];

  // Dedup: skip if same employer+question_kind already present
  const alreadyPresent = existing.some(
    (e) => e.employer === entry.employer && e.question_kind === entry.question_kind,
  );
  if (alreadyPresent) return storyContent;

  const updated = [...existing, entry];
  const newData = { ...data, employers_used: updated };

  // Re-stringify preserving body byte-for-byte
  return matter.stringify(parsed.content, newData);
}

// ---------------------------------------------------------------------------
// Effectful write-back
// ---------------------------------------------------------------------------

/**
 * After a user saves a generated draft, update employers_used in each story
 * that was cited in the provenance. Errors are caught and logged — never thrown.
 */
export async function recordStoryUsage(userId: string, draftId: string): Promise<void> {
  try {
    const { prisma } = await import("@/server/db");
    const { memoryService } = await import("@/server/memory/service");

    const draft = await prisma.generatedDraft.findFirst({
      where: { id: draftId, userId },
      select: { provenance: true, context: true },
    });
    if (!draft) return;

    // Parse provenance
    let storiesUsed: string[] = [];
    let questionKind = "general";
    try {
      const rawProv: unknown = typeof draft.provenance === "string"
        ? JSON.parse(draft.provenance)
        : draft.provenance;
      const prov = rawProv as Record<string, unknown>;
      storiesUsed = Array.isArray(prov.storiesUsed)
        ? (prov.storiesUsed as unknown[]).map(String)
        : [];
      questionKind = typeof prov.questionKind === "string" ? prov.questionKind : "general";
    } catch {
      return;
    }

    if (!storiesUsed.length) return;

    // Parse context for employer
    let employerName: string | null = null;
    try {
      const ctx = typeof draft.context === "string"
        ? (JSON.parse(draft.context) as Record<string, unknown>)
        : (draft.context as Record<string, unknown>);
      if (ctx && typeof ctx.employer === "string" && ctx.employer) {
        employerName = ctx.employer;
      }
    } catch {
      // no employer
    }

    if (!employerName) return;

    const employerSlug = employerSlugOf(employerName);
    const today = new Date().toISOString().slice(0, 10);
    const entry: UsageEntry = { employer: employerSlug, date: today, question_kind: questionKind };

    for (const slug of storiesUsed) {
      const path = `stories/${slug}.md`;
      const file = await memoryService.read(userId, path);
      if (!file) continue;

      const updated = appendUsage(file.content, entry);
      if (updated !== file.content) {
        await memoryService.write(userId, path, updated, "CYCLOPS", "story used in application draft");
      }
    }
  } catch (err) {
    console.error("[story-usage] recordStoryUsage failed", { userId, draftId, err });
  }
}
