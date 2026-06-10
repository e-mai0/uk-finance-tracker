import matter from "gray-matter";
import { employerSlugOf } from "@/server/engine/stories";
import { normalizeFrontmatterData } from "@/server/engine/frontmatter";
import type { createMemoryService } from "@/server/memory/service";

type MemoryService = ReturnType<typeof createMemoryService>;

/** Dependencies for distillOutcomes, injectable for tests (mirrors the gardener split). */
export interface OutcomeDeps {
  svc: MemoryService;
  listApplications(
    userId: string,
  ): Promise<{ employerName: string | null; status: string }[]>;
}

const POSITIVE = new Set(["INTERVIEWING", "OFFER"]);
const SETTLED = new Set(["INTERVIEWING", "OFFER", "REJECTED"]);

/**
 * Pure: derive story signal updates from the outcomes of applications that used it.
 * - Any positive outcome: strength becomes "high" and `clearFailure` is true,
 *   meaning a stale failure_signal should be DELETED (positive evidence
 *   supersedes the old failure note).
 * - 2+ rejections with no positives: a failure note is set.
 * - Otherwise (no data / small sample): everything null and `clearFailure`
 *   false, meaning leave existing signals alone.
 */
export function deriveStorySignal(
  outcomes: { status: string }[],
): { strength: string | null; failure: string | null; clearFailure: boolean } {
  const positives = outcomes.filter((o) => POSITIVE.has(o.status)).length;
  const rejections = outcomes.filter((o) => o.status === "REJECTED").length;
  if (positives > 0) return { strength: "high", failure: null, clearFailure: true };
  if (rejections >= 2) {
    return {
      strength: null,
      failure: `used in ${rejections} rejected applications (observational, small sample)`,
      clearFailure: false,
    };
  }
  return { strength: null, failure: null, clearFailure: false };
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

const OBSERVATION_LINE_RE = /^- Application outcomes: /;
const OBSERVATIONS_HEADING_RE = /^## Observations\s*$/;

/**
 * Pure, self-healing supersession of the observation line in strategy.md:
 * - If any observation lines exist, the first becomes `line` and ALL others
 *   are removed (a past concurrent first-run race may have duplicated them;
 *   this converges the file back to exactly one line on the next run).
 * - Otherwise the line is inserted under an existing `## Observations`
 *   heading if present, and only when no heading exists is a new one appended.
 */
export function upsertObservationLine(content: string, line: string): string {
  const lines = content.split("\n");

  if (lines.some((l) => OBSERVATION_LINE_RE.test(l))) {
    let first = true;
    const out: string[] = [];
    for (const l of lines) {
      if (OBSERVATION_LINE_RE.test(l)) {
        if (first) {
          out.push(line);
          first = false;
        }
        // duplicate observation lines are dropped entirely
      } else {
        out.push(l);
      }
    }
    // collapse blank-line doubles left behind by removed duplicates
    return out.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  const headingIdx = lines.findIndex((l) => OBSERVATIONS_HEADING_RE.test(l));
  if (headingIdx !== -1) {
    lines.splice(headingIdx + 1, 0, line);
    return lines.join("\n");
  }

  return `${content.trimEnd()}\n\n## Observations\n${line}\n`;
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
 * Idempotent: re-running with unchanged data performs no writes.
 */
export async function distillOutcomes(userId: string, deps: OutcomeDeps): Promise<void> {
  try {
    const { svc } = deps;
    const today = new Date().toISOString().slice(0, 10);

    const apps = await deps.listApplications(userId);

    // svc.list seeds canonical files, so strategy.md always exists.
    const files = await svc.list(userId);

    // 1. strategy.md observation (supersede the previous one by label, self-healing).
    const line = buildOutcomeObservation(apps, today);
    const strategy = files.find((f) => f.path === "strategy.md");
    if (line && strategy) {
      const next = upsertObservationLine(strategy.content, line);
      if (next !== strategy.content) {
        await svc.write(userId, "strategy.md", next, "CYCLOPS", "outcome observation");
      }
    }

    // 2. Story signals: map stories -> outcomes via employers_used + applications.
    const storyFiles = files.filter((f) => f.path.startsWith("stories/"));
    for (const file of storyFiles) {
      try {
        if (!file.content.startsWith("---")) continue;
        const parsed = matter(file.content);
        // Normalize YAML-parsed Date values back to YYYY-MM-DD strings so
        // re-stringifying does not drift dates into ISO timestamps.
        const data = normalizeFrontmatterData(parsed.data as Record<string, unknown>);
        const usedSlugs = usedEmployerSlugs(data);
        if (!usedSlugs.size) continue;

        const outcomes = apps.filter(
          (a) => a.employerName && usedSlugs.has(employerSlugOf(a.employerName)),
        );
        const { strength, failure, clearFailure } = deriveStorySignal(outcomes);

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
        // Positive evidence clears a stale failure note (only if one is set;
        // "no data" leaves signals alone via clearFailure === false).
        if (clearFailure && nextData.failure_signal != null) {
          delete nextData.failure_signal;
          changed = true;
        }
        if (changed) {
          const next = matter.stringify(parsed.content, nextData);
          await svc.write(
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

/** Production wrapper binding the Prisma and memory-service singletons. */
export async function distillOutcomesForUser(userId: string): Promise<void> {
  const { prisma } = await import("@/server/db");
  const { memoryService } = await import("@/server/memory/service");
  await distillOutcomes(userId, {
    svc: memoryService,
    listApplications: (uid) =>
      prisma.application.findMany({
        where: { userId: uid },
        select: { employerName: true, status: true },
      }),
  });
}
