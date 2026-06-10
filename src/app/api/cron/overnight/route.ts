import { cronAuthorized } from "@/server/cron";
import { prisma } from "@/server/db";
import { checkBudget } from "@/server/ai/budget";
import { ensureEmployerResearch } from "@/server/engine/research";
import { composeBrief, type BriefData } from "@/server/brief/compose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;
// Mirrors STALE_MS in src/server/engine/research.ts (not exported there):
// research older than 14 days will actually be refreshed by ensureEmployerResearch.
const RESEARCH_STALE_MS = 14 * DAY_MS;

// Statuses meaning "already applied or decided" - a deadline reminder is
// pointless for these (see ApplicationStatus in prisma/schema.prisma).
const APPLIED_OR_DECIDED = [
  "SUBMITTED",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("unauthorized", { status: 401 });

  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * DAY_MS);
  const today = now.toISOString().slice(0, 10);

  // Users with at least one application or saved opportunity.
  const users = await prisma.user.findMany({
    where: {
      OR: [{ applications: { some: {} } }, { saved: { some: {} } }],
    },
    select: { id: true },
    take: 200,
  });

  let briefs = 0;

  for (const u of users) {
    try {
      // (a) Deadline candidates: saved or tracked (open application)
      // opportunities due within 7 days, excluding ones already applied/decided.
      const candidates = await prisma.opportunity.findMany({
        where: {
          deadlineAt: { gte: now, lte: weekOut },
          OR: [
            { saved: { some: { userId: u.id } } },
            {
              applications: {
                some: { userId: u.id, status: { in: ["DRAFT", "AUTOFILLED"] } },
              },
            },
          ],
          applications: {
            none: { userId: u.id, status: { in: [...APPLIED_OR_DECIDED] } },
          },
        },
        orderBy: { deadlineAt: "asc" },
        take: 5,
        select: {
          title: true,
          deadlineAt: true,
          employerId: true,
          employer: { select: { name: true } },
        },
      });

      const deadlines = candidates
        .filter((c) => c.deadlineAt !== null)
        .map((c) => ({
          employer: c.employer.name,
          title: c.title,
          deadlineAt: (c.deadlineAt as Date).toISOString(),
        }));

      // (b) Research warmup for the distinct employers of those candidates,
      // budget-gated per user. ensureEmployerResearch does not report whether
      // it refreshed or served cache, so check freshness first: only employers
      // whose research is missing or older than 14 days will be refreshed.
      const refreshed: string[] = [];
      if (candidates.length > 0) {
        const { ok } = await checkBudget(u.id);
        if (ok) {
          const byEmployer = new Map(candidates.map((c) => [c.employerId, c.employer.name]));
          const existing = await prisma.employerResearch.findMany({
            where: { employerId: { in: [...byEmployer.keys()] } },
            select: { employerId: true, refreshedAt: true },
          });
          const freshAt = new Map(existing.map((r) => [r.employerId, r.refreshedAt]));
          for (const [employerId, name] of byEmployer) {
            const at = freshAt.get(employerId);
            const willRefresh = !at || now.getTime() - at.getTime() >= RESEARCH_STALE_MS;
            const content = await ensureEmployerResearch(employerId, u.id);
            if (willRefresh && content !== null) refreshed.push(name);
          }
        }
      }

      // (c) Pending gardener questions + stale applications.
      const pending = await prisma.gardenerQuestion.findMany({
        where: { userId: u.id, status: "pending" },
        orderBy: { createdAt: "asc" },
        take: 3,
        select: { question: true },
      });

      // Same staleness rule as the chat brain (src/server/ai/brain.ts):
      // up to 3 SUBMITTED apps with submittedAt older than 14 days.
      const staleRows = await prisma.application.findMany({
        where: {
          userId: u.id,
          status: "SUBMITTED",
          submittedAt: { lt: new Date(now.getTime() - 14 * DAY_MS) },
        },
        orderBy: { submittedAt: "asc" },
        take: 3,
        select: { employerName: true, roleTitle: true, status: true, submittedAt: true },
      });
      const staleApps = staleRows.map((a) => ({
        employer: a.employerName ?? "Unknown employer",
        role: a.roleTitle ?? "role",
        status: a.status,
        daysSince: Math.floor((now.getTime() - (a.submittedAt as Date).getTime()) / DAY_MS),
      }));

      // (d) Compose + deliver the brief (deterministic, zero LLM), idempotent by title.
      const data: BriefData = {
        deadlines,
        refreshed,
        gardenerQuestions: pending.map((p) => p.question),
        staleApps,
      };
      const brief = composeBrief(data, today);
      if (brief) {
        const title = `Morning brief - ${today}`;
        const exists = await prisma.chatSession.findFirst({
          where: { userId: u.id, title },
          select: { id: true },
        });
        if (!exists) {
          await prisma.chatSession.create({
            data: {
              userId: u.id,
              title,
              messages: {
                create: {
                  role: "assistant",
                  parts: JSON.stringify([{ type: "text", text: brief }]),
                },
              },
            },
          });
          briefs += 1;
        }
      }
    } catch (err) {
      // One user never blocks the rest.
      console.error("[cron/overnight] user failed", u.id, err);
    }
  }

  return Response.json({ users: users.length, briefs });
}
