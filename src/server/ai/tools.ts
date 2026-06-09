import { tool } from "ai";
import { z } from "zod";
import { memoryService } from "@/server/memory/service";
import { parseFactLine, effectiveConfidence, volatilityFor } from "@/server/memory/facts";
import { semanticSearch } from "@/server/ai/embed";
import { prisma } from "@/server/db";

export function buildTools(userId: string) {
  return {
    list_memory: tool({
      description: "List all memory files for this user. Returns an array of paths.",
      inputSchema: z.object({}),
      execute: async () => {
        const files = await memoryService.list(userId);
        return files.map((f) => ({ path: f.path }));
      },
    }),

    read_memory: tool({
      description:
        "Read a memory file. Lines with medium or low effective confidence are annotated with [decayed to: <level>]. " +
        "Treat medium-confidence facts as uncertain and confirm before relying on them. " +
        "Treat low-confidence facts as stale — do not assert them without confirmation. " +
        "Returns { path, content } or { error: 'not found' }.",
      inputSchema: z.object({
        path: z.string().describe("The path of the memory file to read (e.g. 'profile.md')."),
      }),
      execute: async ({ path }) => {
        const file = await memoryService.read(userId, path);
        if (!file) return { error: "not found" };

        const now = new Date();
        const volatility = volatilityFor(path);
        const annotatedLines = file.content.split("\n").map((line) => {
          const fact = parseFactLine(line);
          if (!fact) return line;
          const effective = effectiveConfidence(fact, volatility, now);
          if (effective !== fact.confidence) {
            return `${line}  [decayed to: ${effective}]`;
          }
          return line;
        });

        return { path: file.path, content: annotatedLines.join("\n") };
      },
    }),

    edit_memory: tool({
      description:
        "Replace the full content of a memory file. " +
        "SUPERSEDE, don't append: contradicted facts move to the History section with their dates. " +
        "Never rewrite 'Raw notes' sections. " +
        "Provide a short reason describing what changed and why.",
      inputSchema: z.object({
        path: z.string().describe("The path of the memory file to write (e.g. 'profile.md')."),
        content: z.string().describe("The full new content of the memory file."),
        reason: z.string().describe("Short reason for the edit (e.g. 'user confirmed degree is economics')."),
      }),
      execute: async ({ path, content, reason }) => {
        const { diff } = await memoryService.write(userId, path, content, "CYCLOPS", reason);
        return { saved: true, diff };
      },
    }),

    search_applications: tool({
      description:
        "Search the user's application history using both semantic similarity and recent-activity queries. " +
        "Returns { semantic: [...], recentApplications: [...] }.",
      inputSchema: z.object({
        query: z.string().describe("Natural-language query describing what you are looking for."),
      }),
      execute: async ({ query }) => {
        const [semanticHits, recent] = await Promise.all([
          semanticSearch(userId, query, 6).catch(() => [] as Awaited<ReturnType<typeof semanticSearch>>),
          prisma.application.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            take: 10,
            select: {
              employerName: true,
              roleTitle: true,
              status: true,
              submittedAt: true,
              externalUrl: true,
            },
          }),
        ]);

        const semantic = semanticHits.map((hit) => ({
          kind: hit.kind,
          excerpt: hit.content.slice(0, 400),
          confidence:
            hit.similarity > 0.75 ? "high" : hit.similarity > 0.55 ? "medium" : "low",
        }));

        return { semantic, recentApplications: recent };
      },
    }),

    search_opportunities: tool({
      description:
        "Search the public opportunity catalog by title or employer name. " +
        "Returns up to 10 matching opportunities with id, employer, title, location, deadlineAt, and status.",
      inputSchema: z.object({
        query: z.string().describe("Search term — matched against opportunity title and employer name."),
      }),
      execute: async ({ query }) => {
        const opps = await prisma.opportunity.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { employer: { name: { contains: query, mode: "insensitive" } } },
            ],
          },
          include: { employer: { select: { name: true } } },
          take: 10,
        });
        return opps.map((o) => ({
          id: o.id,
          employer: o.employer.name,
          title: o.title,
          location: o.location,
          deadlineAt: o.deadlineAt,
          status: o.status,
        }));
      },
    }),

    fit_check: tool({
      description:
        "Load the fit assessment for an opportunity. Narrate the reasons honestly, including weaknesses. " +
        "Returns employer, title, eligibilityNotes, score (null if not yet computed), and reasons.",
      inputSchema: z.object({
        opportunityId: z.string().describe("The id of the opportunity to check fit for."),
      }),
      execute: async ({ opportunityId }) => {
        const [matchScore, opportunity] = await Promise.all([
          prisma.matchScore.findUnique({
            where: { userId_opportunityId: { userId, opportunityId } },
          }),
          prisma.opportunity.findUnique({
            where: { id: opportunityId },
            include: { employer: { select: { name: true } } },
          }),
        ]);

        if (!opportunity) return { error: "opportunity not found" };

        // reasons is stored as Json (string[]) in the schema
        let reasons: string[] = [];
        if (matchScore?.reasons) {
          const raw = matchScore.reasons;
          if (Array.isArray(raw)) {
            reasons = raw as string[];
          } else if (typeof raw === "string") {
            try {
              reasons = JSON.parse(raw) as string[];
            } catch {
              reasons = [raw];
            }
          }
        }

        return {
          employer: opportunity.employer.name,
          title: opportunity.title,
          eligibilityNotes: opportunity.eligibilityNotes ?? null,
          score: matchScore?.score ?? null,
          reasons,
        };
      },
    }),
  };
}
