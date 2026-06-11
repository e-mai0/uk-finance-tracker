import { createHash } from "node:crypto";

/**
 * Change detection for custom-ATS career sites with no machine-readable feed
 * (the `monitored_change_detection_only` strategy in source-plans). Two
 * strategies, picked from the fetched body:
 *
 * - **Sitemap diff** — when the watched URL is a sitemap (e.g. Citadel's
 *   career-sitemap.xml), we diff the role-URL set between runs: new URLs are
 *   new roles, removed URLs are closings. Precise and cheap.
 * - **Page hash** — otherwise we hash the page (scripts/styles stripped). A
 *   change means "something on the listings page moved — review it". This is
 *   best-effort for client-rendered SPAs, whose HTML shell may not change.
 *
 * Watch outcomes are never auto-published; they surface on /radar for review.
 * Pure (the caller fetches), so every branch is unit-testable.
 */

export type WatchState =
  | { kind: "sitemap"; urls: string[] }
  | { kind: "page"; hash: string };

export interface WatchOutcome {
  changed: boolean;
  summary: string;
  state: WatchState;
  /** Role URLs that appeared since the previous run (sitemap strategy). */
  newUrls: string[];
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Strip the volatile parts of an HTML page (scripts, styles, comments) and
 *  collapse whitespace so build-hash churn doesn't read as a content change. */
export function normalizeHtmlForHash(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+/g, ">")
    .replace(/\s+</g, "<")
    .trim();
}

export function isSitemapXml(body: string): boolean {
  const head = body.slice(0, 2000);
  return /<\s*(urlset|sitemapindex)[\s>]/i.test(head);
}

export function extractSitemapLocs(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi)) {
    out.push(m[1]);
  }
  return [...new Set(out)].sort();
}

export function evaluateWatch(
  prev: WatchState | null,
  body: string,
): WatchOutcome {
  if (isSitemapXml(body)) {
    const urls = extractSitemapLocs(body);
    const state: WatchState = { kind: "sitemap", urls };
    if (!prev || prev.kind !== "sitemap") {
      return {
        changed: false,
        summary: `baseline captured (${urls.length} role URLs)`,
        state,
        newUrls: [],
      };
    }
    const prevSet = new Set(prev.urls);
    const nextSet = new Set(urls);
    const added = urls.filter((u) => !prevSet.has(u));
    const removed = prev.urls.filter((u) => !nextSet.has(u));
    if (added.length === 0 && removed.length === 0) {
      return {
        changed: false,
        summary: `no change (${urls.length} role URLs)`,
        state,
        newUrls: [],
      };
    }
    const parts = [
      added.length > 0 ? `${added.length} new` : null,
      removed.length > 0 ? `${removed.length} removed` : null,
    ].filter(Boolean);
    return {
      changed: true,
      summary: `${parts.join(", ")} role URL${added.length + removed.length === 1 ? "" : "s"}`,
      state,
      newUrls: added,
    };
  }

  const hash = sha256(normalizeHtmlForHash(body));
  const state: WatchState = { kind: "page", hash };
  if (!prev || prev.kind !== "page") {
    return {
      changed: false,
      summary: "baseline captured (page hash)",
      state,
      newUrls: [],
    };
  }
  if (prev.hash === hash) {
    return { changed: false, summary: "no change (page hash)", state, newUrls: [] };
  }
  return {
    changed: true,
    summary: "listings page content changed",
    state,
    newUrls: [],
  };
}
