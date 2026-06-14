import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, fetchText, originalSummary, type AdapterEmployer } from "./common";

const MQ_RE = /<article class="article--result">[\s\S]*?href="([^"]*JobDetail\?jobId=(\d+))"[^>]*>\s*([^<]+?)\s*<\/a>(?:[\s\S]*?Office Location:"[^>]*>\s*<[^>]*>\s*([^<]+?)\s*<)?/gi;

export function mapMacquarie(html: string, base: string, employer: AdapterEmployer): RawOpportunity[] {
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(MQ_RE)) {
    const [, href, jobId, title, location = ""] = m;
    if (seen.has(jobId)) continue; seen.add(jobId);
    if (/job alert/i.test(title)) continue; // skip the "Set up a job alert" UI row
    const verdict = classifyPosting({ title: title.trim(), location: location.trim() || title }, fallback);
    if (!verdict.include) continue;
    const url = href.startsWith("http") ? href : `${base}${href}`;
    out.push({ employer: employer.name, title: title.trim(), roleFamily: verdict.roleFamily,
      location: location.trim() || "London", status: "OPEN",
      summary: originalSummary({ title: title.trim(), employer: employer.name, atsLabel: "careers site (Avature)", location: location.trim() || "UK" }),
      applicationUrl: url, sourceUrl: url, sourceType: "AVATURE", tags: [] });
  }
  return out;
}

// UBS embedded-JSON parser: the home shell embeds entity-encoded JSON rows.
export function mapUbsEmbedded(html: string, base: string, employer: AdapterEmployer): RawOpportunity[] {
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  const decoded = html.replace(/&quot;/g, '"');
  for (const m of decoded.matchAll(/"reqid":(\d+)[\s\S]*?"jobtitle":"([^"]+)"[\s\S]*?"formtext23":"([^"]*)"/gi)) {
    const [, reqid, title, country] = m;
    const verdict = classifyPosting({ title, location: country }, fallback);
    if (!verdict.include) continue;
    const url = `${base}/TGnewUI/Search/Home/HomeWithPreLoad?partnerid=25008&siteid=5131&PageType=JobDetails&jobid=${reqid}`;
    out.push({ employer: employer.name, title: title.trim(), roleFamily: verdict.roleFamily,
      location: /united kingdom|london/i.test(country) ? "London" : country || "UK", status: "OPEN",
      summary: originalSummary({ title: title.trim(), employer: employer.name, atsLabel: "careers site (Avature)", location: "London" }),
      applicationUrl: url, sourceUrl: url, sourceType: "AVATURE", tags: [] });
  }
  return out;
}

export class AvatureAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "avature" }>, private readonly employer: AdapterEmployer) {
    this.id = `avature:${cfg.variant}`;
  }
  async fetch(): Promise<RawDataset> {
    if (this.cfg.variant === "macquarie") {
      const html = await fetchText(`${this.cfg.base}/en_US/careers/SearchJobs/?search=internship`);
      return buildDataset(this.id, this.employer, mapMacquarie(html, this.cfg.base, this.employer));
    }
    const html = await fetchText(`${this.cfg.base}/TGnewUI/Search/Home/Home?partnerid=25008&siteid=${this.cfg.siteid}`);
    return buildDataset(this.id, this.employer, mapUbsEmbedded(html, this.cfg.base, this.employer));
  }
}
