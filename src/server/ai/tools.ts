import { tool } from "ai";
import { z } from "zod";
import { memoryService } from "@/server/memory/service";
import { annotateDecay } from "@/server/memory/facts";
import { rawNotesGuardPasses } from "@/server/memory/gardener";
import { isAllowedMemoryPath, stripDecayAnnotations, normalizeReasons } from "@/server/ai/tool-guards";
import { semanticSearch } from "@/server/ai/embed";
import { prisma } from "@/server/db";
import { OpportunityStatus } from "@prisma/client";

const MAX_FILE_COUNT = 100;

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

        // Use file.path (the normalized path) so volatilityFor always gets the
        // canonical form — never the raw input arg (item 9).
        const annotated = annotateDecay(file.path, file.content, new Date());
        return { path: file.path, content: annotated };
      },
    }),

    edit_memory: tool({
      description:
        "Replace the full content of a memory file. " +
        "SUPERSEDE, don't append: contradicted facts move to the History section with their dates. " +
        "Never rewrite 'Raw notes' sections. " +
        "Never include [decayed to: ...] annotations in content. " +
        "Provide a short reason describing what changed and why.",
      inputSchema: z.object({
        path: z.string().describe("The path of the memory file to write (e.g. 'profile.md')."),
        content: z.string().describe("The full new content of the memory file."),
        reason: z.string().describe("Short reason for the edit (e.g. 'user confirmed degree is economics')."),
      }),
      execute: async ({ path, content, reason }) => {
        // Item 3a: restrict allowed paths
        if (!isAllowedMemoryPath(path)) {
          return { error: "path not allowed" };
        }

        // Item 3b: strip any decay annotations before writing
        const cleanContent = stripDecayAnnotations(content);

        // Item 3c: raw-notes guard
        const existing = await memoryService.read(userId, path);
        if (existing && !rawNotesGuardPasses(existing.content, cleanContent)) {
          return {
            error:
              "Raw notes sections must be preserved verbatim. Re-send with the original Raw notes content intact.",
          };
        }

        // Item 3d: file ceiling (only for new files, not edits of existing ones)
        if (!existing) {
          const allFiles = await memoryService.list(userId);
          if (allFiles.length >= MAX_FILE_COUNT) {
            return { error: "Memory file limit reached (100 files). Cannot create new files." };
          }
        }

        const { diff } = await memoryService.write(userId, path, cleanContent, "CYCLOPS", reason);
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
        "Returns up to 10 matching non-closed opportunities ordered by deadline (soonest first).",
      inputSchema: z.object({
        query: z.string().describe("Search term — matched against opportunity title and employer name."),
      }),
      execute: async ({ query }) => {
        const opps = await prisma.opportunity.findMany({
          where: {
            status: { not: OpportunityStatus.CLOSED },
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { employer: { name: { contains: query, mode: "insensitive" } } },
            ],
          },
          include: { employer: { select: { name: true } } },
          orderBy: { deadlineAt: { sort: "asc", nulls: "last" } },
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

        // Item 13: use normalizeReasons pure helper
        const reasons = normalizeReasons(matchScore?.reasons ?? null);

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
