import { requireToken } from "../../../../server/ext-auth";
import { prisma } from "../../../../server/db";
import { extApplicationSchema } from "../../../../lib/validation";
import { json, unauthorized, preflight } from "../../../../server/ext-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

// Upsert an Application row so the web dashboard reflects real activity from the
// extension. Keyed on (userId, externalUrl) so re-visits update one record.
export async function POST(req: Request) {
  const auth = await requireToken(req);
  if (!auth) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = extApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request.", fieldErrors: parsed.error.flatten().fieldErrors }, 400);
  }
  const d = parsed.data;
  const userId = auth.userId;

  // Best-effort link to a known opportunity by its application URL.
  const opp = await prisma.opportunity.findFirst({
    where: { applicationUrl: d.externalUrl },
    select: { id: true },
  });

  const submittedAt = d.status === "SUBMITTED" ? new Date() : undefined;

  const app = await prisma.application.upsert({
    where: { userId_externalUrl: { userId, externalUrl: d.externalUrl } },
    create: {
      userId,
      externalUrl: d.externalUrl,
      ats: d.ats,
      status: d.status,
      employerName: d.employerName || null,
      roleTitle: d.roleTitle || null,
      opportunityId: opp?.id ?? null,
      source: "EXTENSION",
      submittedAt,
    },
    update: {
      ats: d.ats,
      status: d.status,
      employerName: d.employerName || undefined,
      roleTitle: d.roleTitle || undefined,
      opportunityId: opp?.id ?? undefined,
      submittedAt,
    },
    select: { id: true, status: true },
  });

  return json({ ok: true, applicationId: app.id, status: app.status });
}
