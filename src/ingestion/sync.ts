import type { IngestionSource, PrismaClient } from "@prisma/client";
import type { SourceAdapter } from "./types";
import { importDataset } from "./import";
import { GreenhouseAdapter } from "./adapters/greenhouse";
import { LeverAdapter } from "./adapters/lever";
import { AshbyAdapter } from "./adapters/ashby";
import { JaneStreetAdapter } from "./adapters/janestreet";
import { JsonLdPageAdapter } from "./adapters/jsonld-page";
import { fetchText } from "./adapters/common";
import { evaluateWatch, type WatchState } from "./watch";

/**
 * Sync layer: turns IngestionSource registry rows into adapter runs through
 * the shared import pipeline, recording health per source. Called by the cron
 * route (/api/ingest/sync) and by Firm Scout for an immediate first pull.
 *
 * Three modes per source:
 * - ATS feeds (Greenhouse/Lever/Ashby) and custom feeds (Jane Street JSON,
 *   JSON-LD pages) → parse + import.
 * - `watchOnly` rows (opaque custom-ATS sites) → change detection only;
 *   changes are flagged for review on /radar, never auto-published.
 */

// A source that fails this many runs in a row is auto-disabled so a dead board
// can't burn the sync budget forever; it stays visible in the registry.
const MAX_CONSECUTIVE_FAILURES = 10;

export function adapterFor(source: IngestionSource): SourceAdapter | null {
  const employer = {
    name: source.employerName,
    sector: source.sector,
    website: source.url,
  };
  switch (source.kind) {
    case "GREENHOUSE":
      return new GreenhouseAdapter(source.identifier, employer);
    case "LEVER":
      return new LeverAdapter(source.identifier, employer);
    case "ASHBY":
      return new AshbyAdapter(source.identifier, employer);
    case "CAREERS_PAGE": {
      if (!source.url) return null;
      // Jane Street's internships live behind its own public JSON feed (its
      // Greenhouse board only carries experienced/new-grad roles).
      if (new URL(source.url).hostname.endsWith("janestreet.com")) {
        return new JaneStreetAdapter(employer);
      }
      return new JsonLdPageAdapter(source.url, source.identifier, employer);
    }
    default:
      return null;
  }
}

export interface SourceSyncResult {
  sourceId: string;
  employerName: string;
  ok: boolean;
  created: number;
  updated: number;
  /** Watch-only sources: did the watched surface change this run? */
  changed?: boolean;
  summary?: string;
  error?: string;
}

async function recordFailure(
  prisma: PrismaClient,
  source: IngestionSource,
  message: string,
): Promise<void> {
  const failures = source.consecutiveFailures + 1;
  const disable = failures >= MAX_CONSECUTIVE_FAILURES;
  await prisma.ingestionSource.update({
    where: { id: source.id },
    data: {
      lastRunAt: new Date(),
      lastStatus: disable
        ? `disabled after ${failures} consecutive failures`
        : `error (${failures} in a row)`,
      lastError: message.slice(0, 500),
      consecutiveFailures: failures,
      ...(disable ? { enabled: false } : {}),
    },
  });
}

async function syncWatchSource(
  prisma: PrismaClient,
  source: IngestionSource,
): Promise<SourceSyncResult> {
  const base = {
    sourceId: source.id,
    employerName: source.employerName,
    created: 0,
    updated: 0,
  };
  if (!source.url) {
    return { ...base, ok: false, error: "Watch source has no URL" };
  }
  try {
    const body = await fetchText(source.url);
    const prev = (source.watchState as WatchState | null) ?? null;
    const outcome = evaluateWatch(prev, body);
    const detail =
      outcome.newUrls.length > 0
        ? ` — ${outcome.newUrls.slice(0, 3).join(" · ")}`
        : "";
    await prisma.ingestionSource.update({
      where: { id: source.id },
      data: {
        watchState: outcome.state,
        lastRunAt: new Date(),
        lastStatus: outcome.changed
          ? `review: ${outcome.summary}${detail}`
          : `ok: ${outcome.summary}`,
        lastError: null,
        consecutiveFailures: 0,
        ...(outcome.changed ? { lastChangedAt: new Date() } : {}),
      },
    });
    return { ...base, ok: true, changed: outcome.changed, summary: outcome.summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordFailure(prisma, source, message);
    return { ...base, ok: false, error: message };
  }
}

export async function syncSource(
  prisma: PrismaClient,
  source: IngestionSource,
): Promise<SourceSyncResult> {
  if (source.watchOnly) {
    return syncWatchSource(prisma, source);
  }

  const adapter = adapterFor(source);
  if (!adapter) {
    return {
      sourceId: source.id,
      employerName: source.employerName,
      ok: false,
      created: 0,
      updated: 0,
      error: `No live adapter for kind ${source.kind}`,
    };
  }

  try {
    const dataset = await adapter.fetch();
    const result = await importDataset(prisma, dataset);
    await prisma.ingestionSource.update({
      where: { id: source.id },
      data: {
        lastRunAt: new Date(),
        lastStatus: `ok: ${result.created} created, ${result.updated} updated`,
        lastError: null,
        consecutiveFailures: 0,
      },
    });
    return {
      sourceId: source.id,
      employerName: source.employerName,
      ok: true,
      created: result.created,
      updated: result.updated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordFailure(prisma, source, message);
    return {
      sourceId: source.id,
      employerName: source.employerName,
      ok: false,
      created: 0,
      updated: 0,
      error: message,
    };
  }
}

/** Run every enabled source sequentially (gentle on the ATS APIs and well
 *  within a cron window at this registry size). */
export async function syncAllSources(
  prisma: PrismaClient,
): Promise<SourceSyncResult[]> {
  const sources = await prisma.ingestionSource.findMany({
    where: { enabled: true },
    orderBy: { createdAt: "asc" },
  });
  const results: SourceSyncResult[] = [];
  for (const source of sources) {
    results.push(await syncSource(prisma, source));
  }
  return results;
}
