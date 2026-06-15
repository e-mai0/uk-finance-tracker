import { PrismaClient } from "@prisma/client";

/**
 * Raise Prisma's client-side connection pool above the deploy's
 * `connection_limit=1`. That value is far too low for our server components: a
 * layout and its page render concurrently and each fire several queries, so with
 * a single connection they queue, blow past the 10s checkout deadline, and throw
 * P2024 ("Timed out fetching a new connection from the connection pool") — which
 * is what was crashing/hanging /today.
 *
 * We connect through the Supabase transaction pooler (pgbouncer), which
 * multiplexes client connections, so a small per-instance pool is safe. Doing it
 * here (rather than editing connection_limit in DATABASE_URL) keeps it
 * version-controlled and removes the need to touch the production secret.
 */
const POOL_MIN = 5;

function pooledDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;

  let next = url;
  if (/[?&]connection_limit=\d+/.test(next)) {
    // Never downgrade an explicitly higher value.
    next = next.replace(
      /([?&]connection_limit=)(\d+)/,
      (_m, prefix, n) => `${prefix}${Math.max(Number(n), POOL_MIN)}`,
    );
  } else {
    next += (next.includes("?") ? "&" : "?") + `connection_limit=${POOL_MIN}`;
  }
  // A little extra grace acquiring a connection under bursts (default is 10s).
  if (!/[?&]pool_timeout=\d+/.test(next)) {
    next += "&pool_timeout=20";
  }
  return next;
}

// Reuse a single PrismaClient across hot reloads in dev and across serverless
// invocations in production.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const datasourceUrl = pooledDatasourceUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Only override when DATABASE_URL is set; otherwise fall back to the schema.
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
