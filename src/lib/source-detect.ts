/**
 * Detect which ATS a careers/job-board URL belongs to and extract the board
 * identifier the public JSON API needs. Pure + unit-tested; powers Firm Scout
 * ("paste any careers URL and we'll start tracking that firm").
 */

export type SupportedAtsKind = "GREENHOUSE" | "LEVER" | "ASHBY";

export type DetectedSource =
  | { kind: SupportedAtsKind; identifier: string }
  // Recognised ATS we can't ingest yet — stored as a review-queue suggestion.
  | { kind: "UNSUPPORTED"; ats: "WORKDAY"; identifier: string }
  | null;

function firstPathSegment(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg ? decodeURIComponent(seg).toLowerCase() : null;
}

export function detectSource(rawUrl: string): DetectedSource {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  // Greenhouse: boards.greenhouse.io/<token>, job-boards.greenhouse.io/<token>,
  // EU variants, and the embed form (…/embed/job_board?for=<token>).
  if (host === "greenhouse.io" || host.endsWith(".greenhouse.io")) {
    const forToken = url.searchParams.get("for");
    if (forToken) return { kind: "GREENHOUSE", identifier: forToken.toLowerCase() };
    const seg = firstPathSegment(url.pathname);
    if (seg && seg !== "embed") return { kind: "GREENHOUSE", identifier: seg };
    return null;
  }

  // Lever: jobs.lever.co/<site>, jobs.eu.lever.co/<site>
  if (host === "lever.co" || host.endsWith(".lever.co")) {
    const seg = firstPathSegment(url.pathname);
    return seg ? { kind: "LEVER", identifier: seg } : null;
  }

  // Ashby: jobs.ashbyhq.com/<board-name>
  if (host === "ashbyhq.com" || host.endsWith(".ashbyhq.com")) {
    const seg = firstPathSegment(url.pathname);
    return seg ? { kind: "ASHBY", identifier: seg } : null;
  }

  // Workday: <tenant>.wd<N>.myworkdayjobs.com — recognised but not ingestible
  // from a public JSON feed yet.
  const workday = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (workday) {
    return { kind: "UNSUPPORTED", ats: "WORKDAY", identifier: workday[1] };
  }

  return null;
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.(local|internal|lan)$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[/, // IPv6 literal — reject wholesale
];

/**
 * Guard for fetching a user-supplied URL server-side (Firm Scout probing a
 * custom careers site): https-or-http only, no credentials, default ports,
 * and no loopback/private/link-local hosts. Returns the parsed URL or null.
 */
export function safePublicUrl(rawUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) return null;
  if (PRIVATE_HOST_PATTERNS.some((p) => p.test(host))) return null;
  return url;
}

/** "jane-street" → "Jane Street" — used when the scout doesn't name the firm. */
export function prettifyIdentifier(identifier: string): string {
  return identifier
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
