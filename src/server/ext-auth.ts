import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./db";

/**
 * Bearer-token auth for the browser extension. The extension can't ride the
 * NextAuth session cookie cross-origin, so each user mints a personal API token
 * in Settings. Only the SHA-256 hash is stored; the plaintext is shown once and
 * handed to the extension.
 */

const TOKEN_PREFIX = "trk_";

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/** Generate a new opaque token (plaintext, shown once). */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(24).toString("hex");
}

/** Mint + persist a token for a user. Returns the one-time plaintext. */
export async function mintToken(
  userId: string,
  name = "Browser extension",
): Promise<{ id: string; token: string }> {
  const token = generateToken();
  const rec = await prisma.apiToken.create({
    data: { userId, name, tokenHash: hashToken(token) },
    select: { id: true },
  });
  return { id: rec.id, token };
}

function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value.trim();
}

/**
 * Resolve the user behind a request's bearer token, or null. Bumps lastUsedAt.
 * Uses a constant-time compare on the hash as defence in depth (the unique
 * index lookup already happens on the hash).
 */
export async function requireToken(req: Request): Promise<{ userId: string } | null> {
  const plain = extractBearer(req);
  if (!plain || !plain.startsWith(TOKEN_PREFIX)) return null;

  const hash = hashToken(plain);
  const rec = await prisma.apiToken.findUnique({
    where: { tokenHash: hash },
    select: { id: true, userId: true, tokenHash: true, revokedAt: true },
  });
  if (!rec || rec.revokedAt) return null;

  const a = Buffer.from(rec.tokenHash);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Best-effort usage stamp; don't block the request on it.
  prisma.apiToken
    .update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: rec.userId };
}
