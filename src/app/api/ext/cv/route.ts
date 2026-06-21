import { requireToken } from "../../../../server/ext-auth";
import { prisma } from "../../../../server/db";
import { signedCvUrl } from "../../../../server/storage";
import { json, unauthorized, preflight, CORS_HEADERS } from "../../../../server/ext-http";
import { enforceExtLimit } from "../../../../server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

// Returns a short-lived signed download URL for the user's CV, so the extension
// can fetch the bytes and attach them to file-upload fields.
export async function GET(req: Request) {
  const auth = await requireToken(req);
  if (!auth) return unauthorized();

  // Abuse rate-limit per token-user for this surface; fails open if Redis down.
  const limited = await enforceExtLimit("cv", auth.userId, CORS_HEADERS);
  if (limited) return limited;

  const ap = await prisma.applyProfile.findUnique({
    where: { userId: auth.userId },
    select: { cvStoragePath: true, cvFileName: true },
  });
  if (!ap?.cvStoragePath) return json({ error: "No CV on file." }, 404);

  const url = await signedCvUrl(ap.cvStoragePath, 120);
  return new Response(
    JSON.stringify({ url, fileName: ap.cvFileName }),
    { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
  );
}
