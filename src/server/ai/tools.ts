import { tool } from "ai";
import { z } from "zod";
import { memoryService } from "@/server/memory/service";
import { annotateDecay } from "@/server/memory/facts";
import { rawNotesGuardPasses } from "@/server/memory/gardener";
import { isAllowedMemoryPath, stripDecayAnnotations, normalizeReasons } from "@/server/ai/tool-guards";
import { semanticSearch } from "@/server/ai/embed";
import { prisma } from "@/server/db";
import { OpportunityStatus } from "@prisma/client";
import { ensureEmployerResearch } from "@/server/engine/research";
import { gatherSubstance } from "@/server/engine/substance";
import { draftText } from "@/server/engine/draft";
import { distillOutcomesForUser } from "@/server/engine/outcomes";
import { slugify } from "@/ingestion/import";

const MAX_FILE_COUNT = 100;

export function buildTools(userId: string) {
  return {
    go_to_cv: tool({
      description:
        "Take the user to their CV workspace to CREATE, EDIT, IMPROVE, or TAILOR their CV. " +
        "Use this ONLY when the user wants to change their actual CV document — e.g. " +
        "'improve my CV', 'tighten my CV summary', 'make my experience bullets stronger', " +
        "'tailor my CV to Goldman', 'rewrite my CV for a quant role', 'add a projects section to my CV'. " +
        "Forward their instruction verbatim in `request` (in their words); the CV coach will act on it there. " +
        "Do NOT call this for general questions ABOUT CVs that you can simply answer in chat — " +
        "e.g. 'what should a finance CV include?', 'explain the STAR method', 'should I mention my GPA?', " +
        "'how long should a CV be?'. Do NOT call this for anything unrelated to editing their CV " +
        "(e.g. 'what's the Goldman deadline?', 'research Jane Street', 'draft my cover letter'). " +
        "When in doubt between answering a CV question and navigating, prefer to answer; only navigate when the " +
        "user clearly wants to work ON their own CV document.",
      inputSchema: z.object({
        request: z
          .string()
          .describe(
            "The user's CV instruction to forward to the CV coach, in the user's own words (e.g. 'tighten my summary').",
          ),
      }),
      // Pure: no DB work, no side effects. Returns a navigation SIGNAL the
      // client interprets (discriminant: kind === "navigate"). Auth/budget are
      // handled by the route; this tool just echoes a validated signal.
      execute: async ({ request }) => {
        return { kind: "navigate" as const, to: "/cv" as const, pane: "refine" as const, request };
      },
    }),

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
        "Provide a short reason describing what changed and why. " +
        "Capture the DURABLE, APPLICATION-RELEVANT facts that make answers and fit checks sharper, not chit-chat. Prioritise: " +
        "target firms and divisions/desks they care about (e.g. 'targeting Goldman M&A', 'interested in rates trading') and the programme/programmes they want (spring week, summer, off-cycle); " +
        "their key STORIES with QUANTIFIED results (numbers, scale, outcome) that can anchor a STAR answer; " +
        "hard CONSTRAINTS — work authorisation / visa / sponsorship, location, and timing/availability; " +
        "and any application DEADLINES or dates they mention. " +
        "Stick to confidence discipline: facts the user states directly are high confidence dated today; never assert a medium/low fact as flat truth.",
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

    research_employer: tool({
      description:
        "Get shared research on any company by name (divisions, culture, recent news, common questions). " +
        "Works for companies not yet in the catalog: they are added and researched live via web search. " +
        "Generates fresh research if the cache is stale (>14 days). Contains no user data.",
      inputSchema: z.object({
        employerName: z.string().describe("The company name to research, e.g. 'Barclays' or 'Jane Street'."),
      }),
      execute: async ({ employerName }) => {
        const name = employerName.trim();
        if (!name) return { error: "empty employer name" };

        // Exact-match first (case-insensitive), fall back to contains with deterministic ordering
        const exactMatch = await prisma.employer.findFirst({
          where: { name: { equals: name, mode: "insensitive" } },
        });
        let employer =
          exactMatch ??
          (await prisma.employer.findFirst({
            where: { name: { contains: name, mode: "insensitive" } },
            orderBy: { name: "asc" },
          }));

        // Unknown company: add it to the catalog so research can be cached and
        // shared. Handles the create/create race via the unique constraint.
        if (!employer) {
          const slug = slugify(name);
          if (!slug) return { error: `"${name}" is not a usable company name.` };
          try {
            employer = await prisma.employer.create({ data: { name, slug } });
          } catch {
            employer = await prisma.employer.findFirst({
              where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { slug }] },
            });
            if (!employer) return { error: "could not add employer to the catalog" };
          }
        }

        const content = await ensureEmployerResearch(employer.id, userId);
        return content
          ? { employer: employer.name, research: content }
          : { error: "research unavailable" };
      },
    }),

    draft_text: tool({
      description:
        "Draft an application answer or cover letter in the user's own voice, grounded in their stories and employer research. " +
        "Returns the draft plus provenance (which stories/research were used). " +
        "Use this whenever the user asks for help writing application text.",
      inputSchema: z.object({
        kind: z.enum(["ANSWER", "COVER_LETTER"]),
        question: z.string().describe("The application question, or a synthetic question for cover letters."),
        employerName: z.string().optional().describe("The employer name."),
        roleTitle: z.string().optional().describe("The role title."),
        charLimit: z.number().int().positive().optional().describe("Hard character limit for the answer."),
      }),
      execute: async (input) => {
        const ctx = await gatherSubstance(userId, input);
        const result = await draftText(userId, ctx, input);
        await prisma.generatedDraft.create({
          data: {
            userId,
            kind: input.kind === "COVER_LETTER" ? "COVER_LETTER" : "ANSWER",
            context: { question: input.question, employer: input.employerName ?? null },
            content: result.text,
            model: result.provenance.model,
            provenance: JSON.stringify(result.provenance),
          },
        });
        return { draft: result.text, provenance: result.provenance };
      },
    }),

    update_application_status: tool({
      description:
        "Record the outcome/status of one of the user's applications " +
        "(e.g. they got an interview, an offer, or a rejection). " +
        "Statuses: DRAFT, AUTOFILLED, SUBMITTED, INTERVIEWING, OFFER, REJECTED, WITHDRAWN.",
      inputSchema: z.object({
        employerName: z.string().describe("The employer name for the application to update."),
        roleTitle: z.string().optional().describe("Optional role title to narrow the search."),
        status: z
          .enum(["DRAFT", "AUTOFILLED", "SUBMITTED", "INTERVIEWING", "OFFER", "REJECTED", "WITHDRAWN"])
          .describe("The new status to set."),
      }),
      execute: async ({ employerName, roleTitle, status }) => {
        const matches = await prisma.application.findMany({
          where: {
            userId,
            employerName: { contains: employerName, mode: "insensitive" },
            ...(roleTitle ? { roleTitle: { contains: roleTitle, mode: "insensitive" } } : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: 2,
        });
        if (matches.length === 0) {
          return {
            error: `No tracked application matching "${employerName}". Ask the user to check the Applications page.`,
          };
        }
        // Disambiguation: never update when the match is ambiguous, even if a
        // (partial) roleTitle was provided - it may still hit several rows.
        if (matches.length > 1) {
          return {
            error: `Found multiple applications matching "${employerName}". Please specify the exact role title to disambiguate.`,
            candidates: matches.map((m) => ({ employer: m.employerName, role: m.roleTitle })),
          };
        }
        const app = matches[0];
        await prisma.application.update({
          where: { id: app.id },
          data: {
            status,
            ...(status === "SUBMITTED" ? { submittedAt: new Date() } : {}),
          },
        });
        // Detached on purpose: buildTools has no access to the chat route's
        // request-scoped after(), so this promise is not awaited. On serverless
        // the runtime may freeze before it settles and the distillation is then
        // lost - acceptable, because it is recomputed from scratch on the next
        // status change (self-healing). distillOutcomesForUser catches all
        // errors internally; the .catch is cheap insurance against future
        // signature changes that might reject before that try block.
        void distillOutcomesForUser(userId).catch(() => {});
        return { updated: true, employer: app.employerName, role: app.roleTitle, status };
      },
    }),
  };
}
