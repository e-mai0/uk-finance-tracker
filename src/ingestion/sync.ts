import type { IngestionSource, PrismaClient } from "@prisma/client";
import type { SourceAdapter } from "./types";
import type { SourceConfig } from "./types";
import { importDataset } from "./import";
import { GreenhouseAdapter } from "./adapters/greenhouse";
import { LeverAdapter } from "./adapters/lever";
import { AshbyAdapter } from "./adapters/ashby";
import { JaneStreetAdapter } from "./adapters/janestreet";
import { DeShawAdapter } from "./adapters/deshaw";
import { DeutscheBankBeesiteAdapter } from "./adapters/deutsche-beesite";
import { GoldmanHigherAdapter } from "./adapters/goldman-higher";
import { JsonLdPageAdapter } from "./adapters/jsonld-page";
import { OracleCloudAdapter } from "./adapters/oracle-cloud";
import { TalNetAdapter } from "./adapters/talnet";
import { WorkdayAdapter } from "./adapters/workday";
import { EightfoldAdapter } from "./adapters/eightfold";
import { RadancyAdapter } from "./adapters/radancy";
import { AvatureAdapter } from "./adapters/avature";
import { SmartRecruitersAdapter } from "./adapters/smartrecruiters";
import { SuccessFactorsAdapter } from "./adapters/successfactors";
import { describeError, fetchText, ImpervaBlockedError } from "./adapters/common";
import { mapPool } from "./pool";
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
      // D. E. Shaw's /careers page ships its openings in a __NEXT_DATA__ blob;
      // the adapter fetches the page and parses that SSR payload.
      if (new URL(source.url).hostname.endsWith("deshaw.com")) {
        return new DeShawAdapter(employer);
      }
      if (new URL(source.url).hostname.endsWith("careers.db.com")) {
        return new DeutscheBankBeesiteAdapter(employer);
      }
      if (new URL(source.url).hostname.endsWith("higher.gs.com")) {
        return new GoldmanHigherAdapter(employer);
      }
      return new JsonLdPageAdapter(source.url, source.identifier, employer);
    }
    case "ORACLE_CLOUD": {
      const c = source.config as unknown as Extract<SourceConfig, { ats: "oracle" }>;
      return new OracleCloudAdapter(c, employer);
    }
    case "TALNET": {
      const c = source.config as unknown as Extract<SourceConfig, { ats: "talnet" }>;
      return new TalNetAdapter(c, employer);
    }
    case "WORKDAY": {
      const c = source.config as unknown as Extract<SourceConfig, { ats: "workday" }>;
      return new WorkdayAdapter(c, employer);
    }
    case "EIGHTFOLD": {
      const c = source.config as unknown as Extract<SourceConfig, { ats: "eightfold" }>;
      return new EightfoldAdapter(c, employer);
    }
    case "RADANCY": {
      const c = source.config as unknown as Extract<SourceConfig, { ats: "radancy" }>;
      return new RadancyAdapter(c, employer);
    }
    case "AVATURE": {
      const c = source.config as unknown as Extract<SourceConfig, { ats: "avature" }>;
      return new AvatureAdapter(c, employer);
    }
    case "SMARTRECRUITERS": {
      const c = source.config as unknown as Extract<SourceConfig, { ats: "smartrecruiters" }>;
      return new SmartRecruitersAdapter(c, employer);
    }
    case "SUCCESSFACTORS": {
      const c = source.config as unknown as Extract<SourceConfig, { ats: "successfactors" }>;
      return new SuccessFactorsAdapter(c, employer);
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
    const message = describeError(err);
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
        lastSuccessfulFetchAt: new Date(),
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
    const message = describeError(err);
    if (err instanceof ImpervaBlockedError) {
      await prisma.ingestionSource.update({
        where: { id: source.id },
        data: { lastRunAt: new Date(), lastStatus: "unreachable (bot challenge)", lastError: message.slice(0, 500) },
      });
      return { sourceId: source.id, employerName: source.employerName, ok: false, created: 0, updated: 0, error: message };
    }
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

// Each source is a different host, so a small concurrent pool is polite while
// letting a full registry (~20+ sources, mostly I/O-bound) finish inside one
// daily cron run. Hobby cron is once-per-day, so a single run must cover them
// all — we can't spread work across frequent invocations.
const SYNC_CONCURRENCY = 5;
// Stop starting new sources before the function's 300s limit; any not reached
// keep their older lastRunAt and are picked first next run (oldest-first order).
const SYNC_TIME_BUDGET_MS = 270_000;

/** Run every enabled source with bounded concurrency, oldest-run first, within
 *  a time budget. Returns one result per source (skipped ones are reported). */
export async function syncAllSources(
  prisma: PrismaClient,
  opts: { concurrency?: number; budgetMs?: number } = {},
): Promise<SourceSyncResult[]> {
  const concurrency = opts.concurrency ?? SYNC_CONCURRENCY;
  const budgetMs = opts.budgetMs ?? SYNC_TIME_BUDGET_MS;
  const startedAt = Date.now();
  const sources = await prisma.ingestionSource.findMany({
    where: { enabled: true },
    // Least-recently-run first (never-run sources lead) so a partial run always
    // makes progress on the laggards rather than re-running the same head set.
    orderBy: [{ lastRunAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
  });
  return mapPool(sources, concurrency, (source) => {
    if (Date.now() - startedAt > budgetMs) {
      return Promise.resolve<SourceSyncResult>({
        sourceId: source.id,
        employerName: source.employerName,
        ok: false,
        created: 0,
        updated: 0,
        error: "skipped: sync time budget reached (will run next cycle)",
      });
    }
    return syncSource(prisma, source);
  });
}
