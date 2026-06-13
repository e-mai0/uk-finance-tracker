import type { RoleFamily } from "@prisma/client";
import type { RawDataset, RawEmployer, RawOpportunity } from "../types";
import { roleFamilyFromSector } from "../classify";

/** Identity of the employer a live board belongs to, supplied by the source
 *  registry row so adapters can emit a complete RawDataset. */
export interface AdapterEmployer {
  name: string;
  sector?: string | null;
  website?: string | null;
}

export function fallbackFamilyFor(employer: AdapterEmployer): RoleFamily | null {
  return roleFamilyFromSector(employer.sector);
}

// Polite crawler identification on every outbound ingestion request.
const USER_AGENT = "TrackrBot/1.0 (UK student internship tracker)";

/** Fetch a public ATS JSON endpoint with a hard timeout. Throws on non-2xx so
 *  the sync layer can record the failure against the source. */
export async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Fetch a public page/sitemap as text (same timeout + error contract). */
export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * Original, templated summary. Live boards expose employer-written copy which
 * we deliberately do NOT republish (descriptions are used only to classify);
 * this keeps the "no copied content" guarantee the curated dataset makes.
 */
export function originalSummary(opts: {
  title: string;
  employer: string;
  atsLabel: string;
  department?: string | null;
  location: string;
}): string {
  const dept = opts.department ? ` within ${opts.department}` : "";
  return (
    `${opts.title} at ${opts.employer}${dept}, based in ${opts.location}. ` +
    `Listed live on the employer's ${opts.atsLabel} job board — see the ` +
    `application link for the full description and requirements.`
  );
}

export function buildDataset(
  sourceId: string,
  employer: AdapterEmployer,
  opportunities: RawOpportunity[],
): RawDataset {
  const rawEmployer: RawEmployer = {
    name: employer.name,
    sector: employer.sector ?? undefined,
    website: employer.website ?? undefined,
  };
  return { source: sourceId, employers: [rawEmployer], opportunities };
}

/** Parse an HTTP Retry-After header (delay-seconds form) into milliseconds. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header.trim());
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : null;
}

/** Detect an Imperva/Incapsula challenge served with a 200 (disguised block). */
export function isImpervaBlocked(body: string): boolean {
  const head = body.slice(0, 4000).toLowerCase();
  return (
    head.includes("incapsula incident id") ||
    head.includes("_incapsula_resource") ||
    head.includes("request unsuccessful")
  );
}

/** Deterministic exponential backoff schedule (no jitter — caller adds it). */
export function backoffDelays(attempts: number, base: number, cap: number): number[] {
  return Array.from({ length: attempts }, (_, i) => Math.min(base * 2 ** i, cap));
}

/**
 * Fetch text with retry/backoff. Retries only 429/502/503/504 + network errors,
 * honors Retry-After, and treats an Imperva interstitial (200-disguised) as a
 * failure. Throws ImpervaBlockedError on a persistent interstitial so the sync
 * layer can mark the host unreachable rather than publishing garbage.
 */
export class ImpervaBlockedError extends Error {}

export async function fetchTextRobust(
  url: string,
  opts: { attempts?: number; headers?: Record<string, string> } = {},
): Promise<string> {
  const attempts = opts.attempts ?? 3;
  const delays = backoffDelays(attempts, 600, 8000);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, ...opts.headers },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if ([429, 502, 503, 504].includes(res.status)) {
        const wait = parseRetryAfter(res.headers.get("retry-after")) ?? delays[i];
        if (i < attempts - 1) { await sleep(wait); continue; }
        throw new Error(`GET ${url} → ${res.status} after ${attempts} attempts`);
      }
      if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
      const body = await res.text();
      if (isImpervaBlocked(body)) throw new ImpervaBlockedError(`Imperva interstitial at ${url}`);
      return body;
    } catch (err) {
      lastErr = err;
      if (err instanceof ImpervaBlockedError) throw err; // don't retry a challenge
      if (i < attempts - 1) await sleep(delays[i]);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
