import { cronAuthorized } from "@/server/cron";
import { prisma } from "@/server/db";
import { gardenerDue, runGardenerForUser } from "@/server/memory/gardener";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("unauthorized", { status: 401 });

  const users = await prisma.user.findMany({ select: { id: true }, take: 200 });
  let ran = 0;
  for (const u of users) {
    // Cap of 20 gardener runs per invocation (Haiku cost + duration bound).
    if (ran >= 20) break;
    try {
      if (await gardenerDue(u.id)) {
        await runGardenerForUser(u.id);
        ran += 1;
      }
    } catch (err) {
      // One user never blocks the rest.
      console.error("[cron/gardener] user failed", u.id, err);
    }
  }
  return Response.json({ ran });
}
