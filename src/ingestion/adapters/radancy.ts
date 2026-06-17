import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, fetchJson, originalSummary, type AdapterEmployer } from "./common";

const JOB_RE = /<a\s+href="([^"]+)"\s+data-job-id="(\d+)"[^>]*>[\s\S]*?<h2[^>]*>\s*([^<]+?)\s*<\/h2>(?:[\s\S]*?class="job-location"[^>]*>\s*([^<]+?)\s*<)?/gi;

export function mapRadancy(payload: unknown, base: string, employer: AdapterEmployer): RawOpportunity[] {
  const html = (payload as { results?: string })?.results;
  if (typeof html !== "string") throw new Error("Unexpected Radancy payload: missing `results` html");
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(JOB_RE)) {
    const [, href, jobId, title, location = ""] = m;
    if (seen.has(jobId)) continue; seen.add(jobId);
    const verdict = classifyPosting({ title: title.trim(), location: location.trim() || title }, fallback);
    if (!verdict.include) continue;
    const url = href.startsWith("http") ? href : `${base}${href}`;
    out.push({ employer: employer.name, title: title.trim(), roleFamily: verdict.roleFamily,
      programmeType: verdict.programmeType, region: verdict.region,
      location: location.trim() || "London", status: "OPEN",
      summary: originalSummary({ title: title.trim(), employer: employer.name, atsLabel: "careers site (TalentBrew)", location: location.trim() || "UK" }),
      applicationUrl: url, sourceUrl: url, sourceType: "RADANCY", tags: [] });
  }
  return out;
}

export class RadancyAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "radancy" }>, private readonly employer: AdapterEmployer) {
    this.id = `radancy:${cfg.base}`;
  }
  async fetch(): Promise<RawDataset> {
    const q = "Keywords=intern&SearchType=1&CurrentPage=1&RecordsPerPage=100&ActiveFacetID=0&SortCriteria=0&SortDirection=0&SearchResultsModuleName=Section+3+-+Search+Results&SearchFiltersModuleName=Search+Filters";
    const payload = await fetchJson(`${this.cfg.base}/search-jobs/results?${q}`);
    return buildDataset(this.id, this.employer, mapRadancy(payload, this.cfg.base, this.employer));
  }
}
