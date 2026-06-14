import { prisma } from "../../../../server/db";
import { syncAllSources } from "../../../../ingestion/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300s is the Hobby max (and the default with Fluid Compute). The full source
// registry is I/O-bound and runs concurrently (see syncAllSources), so one daily
// run completes well within this; the prior 60s cut a full run off after ~6.
export const maxDuration = 300;

/**
 * Cron endpoint: pull every enabled ingestion source (see vercel.json for the
 * schedule). Protected by CRON_SECRET — Vercel cron sends it as a Bearer
 * token; the same header works for manual runs (curl) in any environment.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await syncAllSources(prisma);
  const summary = {
    sources: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    created: results.reduce((n, r) => n + r.created, 0),
    updated: results.reduce((n, r) => n + r.updated, 0),
    results,
  };
  return Response.json(summary);
}
