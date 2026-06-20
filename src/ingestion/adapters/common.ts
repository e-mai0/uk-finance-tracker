import http from "node:http";
import https from "node:https";
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
const USER_AGENT = "CyclopsBot/1.0 (UK student internship tracker)";

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

/**
 * Render an error for logging, unwrapping `err.cause`. undici reports every
 * transport failure as a bare "fetch failed" and hides the real reason (DNS,
 * TLS, connection reset, malformed framing) in `.cause`; recording only
 * `.message` is what made the tal.net HTTP-parser failure a mystery on /radar.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    return `${err.message} (cause: ${code ? `${code} ` : ""}${cause.message})`;
  }
  return err.message;
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

/**
 * Detect an oleeoProtect / altcha "Quick Check Needed" bot-challenge served with
 * a 200 (a disguised block). Four tal.net IB boards (Jefferies, Rothschild,
 * Evercore, Lazard) intermittently return a small (~3 KB) interstitial stub
 * instead of the job board; it carries none of the Imperva tokens, so it used to
 * pass as a clean body — the tal.net parser then found zero opportunity tiles
 * and the downstream close-sweep silently closed those firms' real roles.
 *
 * Keyed on the challenge CLASS, not a literal stub: oleeoProtect's interstitial
 * is built around the altcha proof-of-work widget under a "verify you are human"
 * heading. We treat ANY oleeoProtect marker as a block, OR the combination of an
 * altcha widget/script with verification-interstitial copy. A REAL board never
 * carries these (it carries `candidate-opp-tile` job cards instead), so this
 * does not false-positive on a populated board — the presence of an `altcha`
 * widget alone, absent the verification copy, would not be enough, and a real
 * board has neither.
 */
export function isChallengeBlocked(body: string): boolean {
  const head = body.slice(0, 8000).toLowerCase();
  // oleeoProtect is the bot-protection product name and only appears on the
  // challenge stub — an unambiguous, stable signal on its own.
  if (head.includes("oleeoprotect")) return true;
  // Otherwise require an altcha challenge widget/script PLUS interstitial copy,
  // so an incidental mention can't trip detection.
  const hasAltchaWidget =
    head.includes("<altcha-widget") ||
    head.includes("altcha.min.js") ||
    head.includes("data-challengeurl");
  const hasVerifyCopy =
    head.includes("quick check needed") ||
    head.includes("verifying you are human") ||
    head.includes("verify that you are human") ||
    head.includes("verify you are human") ||
    head.includes("complete the verification");
  return hasAltchaWidget && hasVerifyCopy;
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

/**
 * A 200-disguised bot challenge (oleeoProtect/altcha "Quick Check Needed").
 * Extends ImpervaBlockedError so the sync layer's existing
 * `instanceof ImpervaBlockedError` handling marks the source UNREACHABLE and
 * skips the close-sweep — without it, an empty parse from the stub would close
 * the firm's live roles. Throwing here is the complete fix (verified: a thrown
 * adapter fetch error short-circuits importDataset, which owns the close-sweep).
 */
export class ChallengeBlockedError extends ImpervaBlockedError {}

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
      if (isChallengeBlocked(body)) throw new ChallengeBlockedError(`bot challenge (oleeoProtect/altcha) at ${url}`);
      return body;
    } catch (err) {
      lastErr = err;
      if (err instanceof ImpervaBlockedError) throw err; // don't retry a challenge (covers ChallengeBlockedError)
      if (i < attempts - 1) await sleep(delays[i]);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch text using Node's core http(s) parser in LENIENT mode. tal.net boards
 * respond with both Content-Length and Transfer-Encoding: chunked on the same
 * message — illegal per RFC 7230, so undici (the engine behind global `fetch`)
 * rejects it outright with an HTTPParserError surfaced only as "fetch failed".
 * `insecureHTTPParser: true` accepts the ambiguous framing (as browsers/curl
 * do), which is the only way to read these boards server-side without a headless
 * browser. Same non-2xx / Imperva contract as `fetchTextRobust`.
 */
export function fetchTextLenient(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const mod = new URL(url).protocol === "http:" ? http : https;
  return new Promise<string>((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method: "GET",
        insecureHTTPParser: true,
        headers: { "user-agent": USER_AGENT, ...opts.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`GET ${url} → ${status} ${res.statusMessage ?? ""}`.trim()));
            return;
          }
          const body = Buffer.concat(chunks).toString("utf8");
          if (isImpervaBlocked(body)) {
            reject(new ImpervaBlockedError(`Imperva interstitial at ${url}`));
            return;
          }
          if (isChallengeBlocked(body)) {
            reject(new ChallengeBlockedError(`bot challenge (oleeoProtect/altcha) at ${url}`));
            return;
          }
          resolve(body);
        });
        res.on("error", reject);
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`GET ${url} → timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}
