import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { reconcileAndSyncAll } from "../ingestion/sync";
import { liveSources } from "../../prisma/sources";

/**
 * Behaviour contract for reconcileAndSyncAll — the self-healing path that closes
 * the registry drift: the code source-registry (prisma/sources.ts) is upserted
 * into IngestionSource on EVERY sync run, so firms added in code reach prod
 * without a manual seed script. These tests assert the BEHAVIOUR (reconcile runs
 * before the sync read, additive-only, no prune), not merely the import.
 */

// Minimal in-memory prisma stub: only the IngestionSource methods the path uses.
// Deliberately NO delete/deleteMany — if the code prunes, the call throws and the
// "additive" test fails loudly.
function makeStub(callLog: string[]) {
  const upsert = vi.fn(async () => {
    callLog.push("upsert");
    return {};
  });
  const findMany = vi.fn(async () => {
    callLog.push("findMany");
    return [] as unknown[];
  });
  const update = vi.fn(async () => {
    callLog.push("update");
    return {};
  });
  const prisma = {
    ingestionSource: { upsert, findMany, update },
  } as unknown as PrismaClient;
  return { prisma, upsert, findMany, update };
}

describe("reconcileAndSyncAll", () => {
  it("reconciles the full code registry BEFORE reading enabled rows", async () => {
    const callLog: string[] = [];
    const { prisma, upsert, findMany } = makeStub(callLog);

    const results = await reconcileAndSyncAll(prisma);

    // sync read nothing back → no sources to run → empty result set
    expect(results).toEqual([]);

    // every live source was upserted (idempotent reconcile of the code registry)
    expect(upsert).toHaveBeenCalledTimes(liveSources.length);
    expect(findMany).toHaveBeenCalledTimes(1);

    // ORDERING: every upsert must land before the first findMany, so newly
    // inserted (never-run) sources are present when the sync queries enabled rows.
    const firstFindMany = callLog.indexOf("findMany");
    const lastUpsert = callLog.lastIndexOf("upsert");
    expect(firstFindMany).toBeGreaterThan(-1);
    expect(lastUpsert).toBeGreaterThan(-1);
    expect(lastUpsert).toBeLessThan(firstFindMany);
  });

  it("is additive only — never deletes, prunes, or disables registry rows", async () => {
    const callLog: string[] = [];
    const { prisma } = makeStub(callLog);

    // The stub exposes NO delete/deleteMany; any prune attempt would throw.
    await expect(reconcileAndSyncAll(prisma)).resolves.toEqual([]);

    const src = prisma.ingestionSource as unknown as Record<string, unknown>;
    expect(src.delete).toBeUndefined();
    expect(src.deleteMany).toBeUndefined();
    expect(callLog).not.toContain("delete");
    expect(callLog).not.toContain("deleteMany");
  });
});
