import { requireToken } from "../../../../server/ext-auth";
import { buildFieldMap } from "../../../../server/ext-profile";
import { json, unauthorized, preflight, CORS_HEADERS } from "../../../../server/ext-http";
import { enforceExtLimit } from "../../../../server/ratelimit";

// Node runtime: needs Prisma + crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function GET(req: Request) {
  const auth = await requireToken(req);
  if (!auth) return unauthorized();

  // Abuse rate-limit per token-user for this surface; fails open if Redis down.
  const limited = await enforceExtLimit("profile", auth.userId, CORS_HEADERS);
  if (limited) return limited;

  const map = await buildFieldMap(auth.userId);
  return json(map);
}
