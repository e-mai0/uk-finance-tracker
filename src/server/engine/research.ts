import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { sonnet, SONNET_ID } from "@/server/ai/models";
import { recordUsage } from "@/server/ai/budget";
import { prisma } from "@/server/db";

/** Research older than this is considered stale and will be refreshed. */
export const STALE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * In-process inflight guard: prevents stampede when multiple concurrent requests
 * trigger research for the same employer simultaneously. Per-instance (serverless-
 * acceptable since per-instance dedup is sufficient).
 */
const inflight = new Map<string, Promise<string | null>>();

/**
 * Returns fresh research content for an employer, generating/refreshing if the
 * cache is older than 14 days. Returns stale content on failure. Returns null
 * if the employer is not in the catalog.
 */
export async function ensureEmployerResearch(
  employerId: string,
  userIdForBudget?: string,
): Promise<string | null> {
  const existing = await prisma.employerResearch.findUnique({ where: { employerId } });
  if (existing && Date.now() - existing.refreshedAt.getTime() < STALE_MS) {
    return existing.content;
  }

  // Stampede guard: if another call for this employer is already generating, await it
  const inFlight = inflight.get(employerId);
  if (inFlight) {
    return inFlight;
  }

  const generate = (async (): Promise<string | null> => {
    try {
      const employer = await prisma.employer.findUnique({ where: { id: employerId } });
      if (!employer) return null;

      const { text, usage } = await generateText({
        model: sonnet,
        tools: { web_search: anthropic.tools.webSearch_20250305({ maxUses: 4 }) },
        prompt: `Research ${employer.name}${employer.sector ? ` (UK employer, ${employer.sector})` : " (employer with UK presence; determine the sector yourself)"} for a student preparing internship/graduate applications. Produce concise markdown with these sections:
## Divisions & what they do
## Day-to-day work (what an intern/analyst in each main division actually does day to day)
## Culture signals
## Stated values & principles (the firm's OWN stated values/principles, in its own words)
## Concrete recent hooks (at least one specific, checkable thing an applicant could cite: a NAMED recent deal, transaction, fund, mandate, product launch or initiative from roughly the last 6 months, with a date; the kind of detail that survives a competitor-swap test)
## Recent news (last 6 months, with dates)
## Common application questions & what they look for (include any discoverable application question structure and any stated word counts / word caps / character limits)
Facts only, no advice fluff, no applicant-specific content. Cite nothing; just state findings.`,
        maxOutputTokens: 2000,
      });
      if (userIdForBudget) recordUsage(userIdForBudget, usage?.totalTokens ?? 0).catch(() => {});

      const saved = await prisma.employerResearch.upsert({
        where: { employerId },
        create: {
          employerId,
          content: text,
          model: SONNET_ID,
          refreshedAt: new Date(),
        },
        update: {
          content: text,
          model: SONNET_ID,
          refreshedAt: new Date(),
        },
      });
      return saved.content;
    } catch (err) {
      console.error("[research] failed for employer", employerId, err);
      return existing?.content ?? null;
    } finally {
      inflight.delete(employerId);
    }
  })();

  inflight.set(employerId, generate);
  return generate;
}
