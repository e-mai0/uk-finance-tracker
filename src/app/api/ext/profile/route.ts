import { requireToken } from "../../../../server/ext-auth";
import { buildFieldMap } from "../../../../server/ext-profile";
import { json, unauthorized, preflight } from "../../../../server/ext-http";

// Node runtime: needs Prisma + crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function GET(req: Request) {
  const auth = await requireToken(req);
  if (!auth) return unauthorized();

  const map = await buildFieldMap(auth.userId);
  return json(map);
}
