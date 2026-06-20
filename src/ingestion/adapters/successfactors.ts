import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting } from "../classify";
import {
  buildDataset,
  fallbackFamilyFor,
  fetchTextRobust,
  originalSummary,
  type AdapterEmployer,
} from "./common";
import { decodeEntities } from "./talnet";

/**
 * SAP SuccessFactors "Career Site Builder" (CSB) adapter.
 *
 * The legacy RCM portal (`career?company=X`) injects job rows via a stateful
 * JSF/SURJ AjaxService RPC (ViewState + encrypted seq param) that is NOT
 * reproducible server-side without a browser. The modern CSB host, however,
 * server-renders job tiles at a plain, auth-free, JS-free endpoint:
 *
 *   GET https://{host}/tile-search-results/?q=&startrow={N}    (UA: a browser)
 *
 * Each tile is `<li class="job-tile job-id-NNN" data-url="/job/{slug}/NNN/">`
 * with `<a class="jobTitle-link">Title</a>`. Two tenant templates exist:
 *  - RICH tiles render an authoritative location element
 *    (`#job-{id}-desktop-section-location-value` → e.g. "London, GB").
 *  - MINIMAL tiles omit it; the location is only the leading segment of the
 *    data-url slug (`/job/London-Senior-Treasury-Analyst-.../`).
 * We read the rich element when present and otherwise recover the location from
 * the slug by stripping the (known) title off the front — see csbTileLocation.
 *
 * Pagination: increment `startrow` by the page size; an out-of-range startrow
 * returns a near-empty body (no tiles) → stop.
 */

const PAGE_SIZE = 25;
const MAX_ROWS = 2000;

// One tile starts at its opening <li …job-tile…> tag; we scope each card to
// [this <li>, next <li>) so a field is always read from the SAME tile (titles
// repeat 3× per tile for desktop/tablet/mobile — the per-tile scope makes the
// first match the right one). The id and data-url are pulled from the opening
// tag INDEPENDENTLY (not in a fixed order) — SAP CSB does not guarantee
// attribute order, and a positional regex would silently drop a reordered tile.
const TILE_OPEN_RE = /<li\b[^>]*\bjob-tile\b[^>]*>/gi;
const JOB_ID_RE = /\bjob-id-(\d+)\b/i;
const DATA_URL_RE = /\bdata-url="([^"]+)"/i;
const TITLE_RE = /class="jobTitle-link[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/i;
// Rich-tile authoritative location value: the VALUE div
// `<div id="…-section-location-value">London, GB</div>`. Anchored on `id="` so
// it never matches the sibling label span, whose `aria-describedby` also ends in
// `-section-location-value` (that near-miss read the label text "Location").
const LOCATION_VALUE_RE = /id="[^"]*-section-location-value"[^>]*>\s*([^<]+?)\s*</i;

/**
 * Recover a posting's location from a CSB `data-url` slug of the form
 * `/job/{Location}-{Title}[-extra]/{id}/` (hyphen-delimited). The title is
 * known, so we locate its token run within the slug and take the tokens AROUND
 * it as the location: tokens before it (the usual `{Location}-{Title}` order),
 * or — if the title leads the slug — the tokens after it (`{Title}-{Location}`).
 * The title is matched on whole-token boundaries (not a raw substring) so a
 * title token can't mis-slice inside a longer location word (e.g. "Intern" must
 * not match inside "Internationale"). When the title isn't found at all we fall
 * back to the leading slug token, so a UK city is still detectable and a non-UK
 * one still gates out. Returns a space-separated location string.
 */
export function csbTileLocation(dataUrl: string, title: string): string {
  const seg = dataUrl.match(/\/job\/(.+?)\/\d+\/?(?:[?#].*)?$/i)?.[1] ?? "";
  if (!seg) return "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(seg);
  } catch {
    decoded = seg;
  }
  // Split BOTH on hyphens and whitespace: the slug is hyphen-delimited and the
  // CSB slugifier turns a title's spaces AND internal hyphens into the same
  // delimiter, so "Off-Cycle Internship" must tokenize to ["Off","Cycle",
  // "Internship"] to line up with the slug's tokens.
  const slugTokens = decoded.split(/[\s-]+/).filter(Boolean);
  const titleTokens = title.trim().split(/[\s-]+/).filter(Boolean);
  const lower = (a: string[]) => a.map((t) => t.toLowerCase());
  const sLc = lower(slugTokens);
  const tLc = lower(titleTokens);

  // Index of the title token-run within the slug tokens (whole-token match).
  let at = -1;
  if (tLc.length) {
    for (let i = 0; i + tLc.length <= sLc.length; i++) {
      if (tLc.every((t, j) => sLc[i + j] === t)) {
        at = i;
        break;
      }
    }
  }
  if (at > 0) return slugTokens.slice(0, at).join(" "); // {Location}-{Title}
  if (at === 0) return slugTokens.slice(tLc.length).join(" "); // {Title}-{Location}
  return slugTokens[0] ?? ""; // title not found → best-effort leading token
}

export function mapSuccessFactorsTiles(
  html: string,
  host: string,
  employer: AdapterEmployer,
): RawOpportunity[] {
  const origin = host.replace(/\/+$/, "");
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  const seen = new Set<string>();

  const tiles = [...html.matchAll(TILE_OPEN_RE)];
  for (let i = 0; i < tiles.length; i++) {
    const openTag = tiles[i][0];
    const id = openTag.match(JOB_ID_RE)?.[1];
    const dataUrl = openTag.match(DATA_URL_RE)?.[1];
    if (!id || !dataUrl) continue; // a tile missing either is unusable
    if (seen.has(id)) continue;
    const start = tiles[i].index ?? 0;
    const end = i + 1 < tiles.length ? tiles[i + 1].index ?? html.length : html.length;
    const scope = html.slice(start, end);

    const titleRaw = scope.match(TITLE_RE)?.[1];
    if (!titleRaw) continue;
    const title = decodeEntities(titleRaw).replace(/\s+/g, " ").trim();
    if (!title) continue;
    seen.add(id);

    const locValue = scope.match(LOCATION_VALUE_RE)?.[1];
    const location = locValue
      ? decodeEntities(locValue).replace(/\s+/g, " ").trim()
      : csbTileLocation(dataUrl, title);

    const verdict = classifyPosting({ title, location }, fallback);
    if (!verdict.include) continue;

    const url = `${origin}${dataUrl}`;
    out.push({
      employer: employer.name,
      title,
      roleFamily: verdict.roleFamily,
      programmeType: verdict.programmeType,
      location: location || "London",
      status: "OPEN",
      summary: originalSummary({
        title,
        employer: employer.name,
        atsLabel: "SuccessFactors careers site",
        location: location || "UK",
      }),
      applicationUrl: url,
      sourceUrl: url,
      sourceType: "SUCCESSFACTORS",
      tags: [],
    });
  }
  return out;
}

export class SuccessFactorsAdapter implements SourceAdapter {
  readonly id: string;
  constructor(
    private readonly cfg: Extract<SourceConfig, { ats: "successfactors" }>,
    private readonly employer: AdapterEmployer,
  ) {
    this.id = `successfactors:${cfg.host}`;
  }

  async fetch(): Promise<RawDataset> {
    const base = `https://${this.cfg.host}/tile-search-results/?q=`;
    const rows: RawOpportunity[] = [];
    const seen = new Set<string>();
    const seenIds = new Set<string>();
    let startrow = 0;
    while (startrow < MAX_ROWS) {
      // CSB serves tiles only to a browser-like UA.
      const html = await fetchTextRobust(`${base}&startrow=${startrow}`, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; CyclopsBot/1.0)" },
      });
      const tiles = [...html.matchAll(TILE_OPEN_RE)];
      if (tiles.length === 0) break; // out-of-range page → empty body → done
      // Stop if the page is all tiles we've already seen — some CSB tenants
      // clamp an out-of-range startrow to the last/first page instead of
      // serving an empty body, which would otherwise spin to MAX_ROWS.
      const pageIds = tiles
        .map((t) => t[0].match(JOB_ID_RE)?.[1])
        .filter((x): x is string => Boolean(x));
      if (pageIds.length > 0 && pageIds.every((id) => seenIds.has(id))) break;
      for (const id of pageIds) seenIds.add(id);
      for (const r of mapSuccessFactorsTiles(html, `https://${this.cfg.host}`, this.employer)) {
        const k = r.applicationUrl ?? r.title;
        if (!seen.has(k)) {
          seen.add(k);
          rows.push(r);
        }
      }
      startrow += PAGE_SIZE;
    }
    return buildDataset(this.id, this.employer, rows);
  }
}
