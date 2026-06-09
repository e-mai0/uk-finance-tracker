import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { sonnet } from "@/server/ai/models";
import { recordUsage } from "@/server/ai/budget";
import { prisma } from "@/server/db";

const STALE_MS = 14 * 24 * 60 * 60 * 1000;

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

  const employer = await prisma.employer.findUnique({ where: { id: employerId } });
  if (!employer) return null;

  try {
    const { text, usage } = await generateText({
      model: sonnet,
      tools: { web_search: anthropic.tools.webSearch_20250305({ maxUses: 4 }) },
      prompt: `Research ${employer.name} (UK finance employer, ${employer.sector ?? "financial services"}) for a student preparing internship/graduate applications. Produce concise markdown with these sections:
## Divisions & what they do
## Culture signals
## Recent news (last 6 months, with dates)
## Common application questions & what they look for
Facts only, no advice fluff, no applicant-specific content. Cite nothing; just state findings.`,
      maxOutputTokens: 2000,
    });
    if (userIdForBudget) recordUsage(userIdForBudget, usage?.totalTokens ?? 0).catch(() => {});

    const saved = await prisma.employerResearch.upsert({
      where: { employerId },
      create: {
        employerId,
        content: text,
        model: "claude-sonnet-4-6",
        refreshedAt: new Date(),
      },
      update: {
        content: text,
        model: "claude-sonnet-4-6",
        refreshedAt: new Date(),
      },
    });
    return saved.content;
  } catch (err) {
    console.error("[research] failed for employer", employer.name, err);
    return existing?.content ?? null;
  }
}
