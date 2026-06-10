import matter from "gray-matter";
import { prisma } from "@/server/db";
import { memoryService } from "@/server/memory/service";
import { employerSlugOf } from "@/server/engine/stories";

const POSITIVE = new Set(["INTERVIEWING", "OFFER"]);
const SETTLED = new Set(["INTERVIEWING", "OFFER", "REJECTED"]);

/** Pure: derive story signal updates from the outcomes of applications that used it. */
export function deriveStorySignal(
  outcomes: { status: string }[],
): { strength: string | null; failure: string | null } {
  const positives = outcomes.filter((o) => POSITIVE.has(o.status)).length;
  const rejections = outcomes.filter((o) => o.status === "REJECTED").length;
  if (positives > 0) return { strength: "high", failure: null };
  if (rejections >= 2) {
    return {
      strength: null,
      failure: `used in ${rejections} rejected applications (observational, small sample)`,
    };
  }
  return { strength: null, failure: null };
}

/** Pure: one observation fact line for strategy.md, or null below the sample floor. */
export function buildOutcomeObservation(
  apps: { status: string }[],
  today: string,
): string | null {
  const settled = apps.filter((a) => SETTLED.has(a.status));
  if (settled.length < 4) return null;
  const progressed = settled.filter((a) => POSITIVE.has(a.status)).length;
  return `- Application outcomes: ${progressed} of ${settled.length} settled applications progressed to interview or offer (confidence: low, confirmed: ${today})`;
}

/** Extract the employer slugs recorded in a story's employers_used frontmatter. */
function usedEmployerSlugs(data: Record<string, unknown>): Set<string> {
  const slugs = new Set<string>();
  if (!Array.isArray(data.employers_used)) return slugs;
  for (const entry of data.employers_used) {
    if (typeof entry === "string") {
      slugs.add(employerSlugOf(entry));
    } else if (entry && typeof entry === "object") {
      const employer = (entry as Record<string, unknown>).employer;
      if (typeof employer === "string" && employer) {
        slugs.add(employerSlugOf(employer));
      }
    }
  }
  slugs.delete("");
  return slugs;
}

/**
 * Distill application outcomes into story frontmatter signals and a single
 * superseding observation line in strategy.md.
 * Cheap and deterministic (no LLM). Never throws.
 */
export async function distillOutcomes(userId: string): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const apps = await prisma.application.findMany({
      where: { userId },
      select: { employerName: true, status: true },
    });

    // memoryService.list seeds canonical files, so strategy.md always exists.
    const files = await memoryService.list(userId);

    // 1. strategy.md observation (supersede the previous one by label).
    const line = buildOutcomeObservation(apps, today);
    const strategy = files.find((f) => f.path === "strategy.md");
    if (line && strategy) {
      const re = /^- Application outcomes: .*$/m;
      const next = re.test(strategy.content)
        ? strategy.content.replace(re, line)
        : `${strategy.content.trimEnd()}\n\n## Observations\n${line}\n`;
      if (next !== strategy.content) {
        await memoryService.write(userId, "strategy.md", next, "CYCLOPS", "outcome observation");
      }
    }

    // 2. Story signals: map stories -> outcomes via employers_used + applications.
    const storyFiles = files.filter((f) => f.path.startsWith("stories/"));
    for (const file of storyFiles) {
      try {
        if (!file.content.startsWith("---")) continue;
        const parsed = matter(file.content);
        const data = parsed.data as Record<string, unknown>;
        const usedSlugs = usedEmployerSlugs(data);
        if (!usedSlugs.size) continue;

        const outcomes = apps.filter(
          (a) => a.employerName && usedSlugs.has(employerSlugOf(a.employerName)),
        );
        const { strength, failure } = deriveStorySignal(outcomes);

        const nextData = { ...data };
        let changed = false;
        if (strength && nextData.strength_signal !== strength) {
          nextData.strength_signal = strength;
          changed = true;
        }
        if (failure && nextData.failure_signal !== failure) {
          nextData.failure_signal = failure;
          changed = true;
        }
        if (changed) {
          const next = matter.stringify(parsed.content, nextData);
          await memoryService.write(
            userId,
            file.path,
            next,
            "CYCLOPS",
            "outcome-informed story signal",
          );
        }
      } catch {
        // one bad story file never aborts the rest
      }
    }
  } catch (err) {
    console.error("[outcomes] distillation failed", { userId, err });
  }
}
