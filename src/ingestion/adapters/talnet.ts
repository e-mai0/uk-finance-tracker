import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, fetchTextLenient, originalSummary, type AdapterEmployer } from "./common";

const MONTHS: Record<string, string> = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };

/** Decode the HTML entities live boards emit in titles/locations (e.g.
 *  "Sales &amp; Trading", "Nov&#39;26", "&#160;"). Left undecoded these both
 *  display wrong AND weaken keyword classification (e.g. "sales & trading"). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Parse a tal.net deadline string (dd/mm/yyyy or 'd Mon yyyy') to ISO YYYY-MM-DD, or null. */
export function parseTalNetDeadline(text: string): string | null {
  const dmy = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  const named = text.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (named) { const m = MONTHS[named[2].toLowerCase()]; if (m) return `${named[3]}-${m}-${named[1].padStart(2,"0")}`; }
  return null;
}

/**
 * Reduce a board opp link to a stable, shareable apply URL. Live boards emit
 * deep links carrying a per-request session prefix —
 * `…/vx/lang-en-GB/mobile-0/appcentre-1/brand-4/xf-<hash>/candidate/so/…` —
 * where `xf-<hash>` ROTATES on every fetch (verified: it changes between two
 * requests minutes apart). Storing it makes the apply link churn every sync and
 * hands users a stale session segment. The server resolves a role purely by its
 * `/pm/N/pl/M/opp/{id}-{slug}/en-GB` tail (verified: wrong xf/appcentre/brand
 * still 200; wrong `pl` 404s), so we keep exactly that and drop the volatile
 * prefix. `pl` is a per-board constant, so the rebuilt link is stable.
 *
 * Accepts a root-relative or fully-qualified href; returns an absolute URL on
 * the board host without doubling it. Falls back to the absolute input when the
 * canonical segments are absent (so we never emit an empty link).
 */
export function canonicalTalNetUrl(href: string, host: string): string {
  const origin = href.startsWith("http") ? new URL(href).origin : `https://${host}`;
  const m = href.match(/\/pm\/(\d+)\/pl\/(\d+)\/opp\/(\d+-[^/]+)\/en-GB/i);
  if (m) return `${origin}/vx/candidate/so/pm/${m[1]}/pl/${m[2]}/opp/${m[3]}/en-GB`;
  return href.startsWith("http") ? href : `${origin}${href}`;
}

// Each role is a tile div carrying its id; we parse per-tile so every field
// (title, location, deadline) is read from the SAME card — not blind-sliced
// from the surrounding markup, which used to borrow a neighbour's deadline.
const TILE_RE = /<div class="opp_(\d+)[^"]*candidate-opp-tile"[^>]*>/gi;
// The opp deep link inside a tile (group 1 = optional origin, 2 = path, 3 = id,
// 4 = anchor text). Boards emit root-relative or fully-qualified hrefs.
const OPP_LINK_RE = /href="(https?:\/\/[^"]*?)?(\/vx\/[^"]*?\/opp\/(\d+)-[^"]*?\/en-GB)"[^>]*>\s*([^<]*?)\s*</i;
// Per-row field cells, matched by LABEL text — the field NUMBER is not stable
// across boards (Nomura field-3 Location/field-4 Deadline; Rothschild/Evercore
// field-3 Deadline, no Location cell). "Application Deadline:" ends in
// "Deadline:", so the deadline matcher covers both labels.
const LOCATION_RE = /Location:\s*<\/span>\s*([^<]+)/i;
const DEADLINE_RE = /Deadline:\s*<\/span>\s*([^<]+)/i;
const DATA_TITLE_RE = /data-title="([^"]*)"/i;

export function mapTalNetBoard(html: string, baseUrl: string, employer: AdapterEmployer): RawOpportunity[] {
  const fallback = fallbackFamilyFor(employer);
  const host = (() => {
    try { return new URL(baseUrl).host; } catch { return baseUrl.replace(/^https?:\/\//, ""); }
  })();
  const out: RawOpportunity[] = [];
  const seen = new Set<string>();

  // Tile start offsets, so each card's scope is [this tile, next tile).
  const tiles = [...html.matchAll(TILE_RE)];
  for (let i = 0; i < tiles.length; i++) {
    const id = tiles[i][1];
    if (seen.has(id)) continue;
    const start = tiles[i].index ?? 0;
    const end = i + 1 < tiles.length ? (tiles[i + 1].index ?? html.length) : html.length;
    const scope = html.slice(start, end);

    const link = scope.match(OPP_LINK_RE);
    if (!link) continue; // a tile without a resolvable opp link is unusable
    const [, origin, path, , anchorText] = link;
    seen.add(id);

    const dataTitle = scope.match(DATA_TITLE_RE)?.[1] ?? "";
    const title = decodeEntities(anchorText.trim() || dataTitle).replace(/\s+/g, " ").trim();
    if (!title) continue;

    // tal.net boards are UK-locale but carry non-UK roles. Gate UK on the
    // per-row Location cell when the board exposes one (the authoritative
    // signal); fall back to the title only when it doesn't, so a UK role whose
    // title omits its city is no longer dropped.
    const locationRaw = scope.match(LOCATION_RE)?.[1];
    const locationCell = locationRaw ? decodeEntities(locationRaw).replace(/\s+/g, " ").trim() || null : null;
    const verdict = classifyPosting({ title, location: locationCell ?? title }, fallback);
    if (!verdict.include) continue;

    const deadlineText = scope.match(DEADLINE_RE)?.[1] ?? null;
    const deadline = deadlineText ? (parseTalNetDeadline(deadlineText) ?? undefined) : undefined;
    const location = locationCell ?? (/london/i.test(title) ? "London" : "UK");
    const url = canonicalTalNetUrl(`${origin ?? ""}${path}`, host);

    out.push({
      employer: employer.name, title, roleFamily: verdict.roleFamily,
      programmeType: verdict.programmeType, region: verdict.region,
      location, status: "OPEN",
      summary: originalSummary({ title, employer: employer.name, atsLabel: "careers job board (tal.net)", location }),
      applicationUrl: url, sourceUrl: url, sourceType: "TALNET",
      deadlineAt: deadline, tags: [],
    });
  }
  return out;
}

export class TalNetAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "talnet" }>, private readonly employer: AdapterEmployer) {
    this.id = `talnet:${cfg.host}/${cfg.board}`;
  }
  async fetch(): Promise<RawDataset> {
    const board = `https://${this.cfg.host}/candidate/jobboard/vacancy/${this.cfg.board}/adv/`;
    // tal.net responses violate RFC 7230 framing (Content-Length + chunked),
    // which undici/`fetch` rejects — use the lenient core-http parser instead.
    const html = await fetchTextLenient(board);
    return buildDataset(this.id, this.employer, mapTalNetBoard(html, `https://${this.cfg.host}`, this.employer));
  }
}
