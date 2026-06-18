import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting, isUkLocation } from "../classify";
import { buildDataset, fallbackFamilyFor, originalSummary, type AdapterEmployer } from "./common";

interface WorkdayPosting { title?: string; externalPath?: string; locationsText?: string; bulletFields?: string[] }

export function mapWorkdayJobs(payload: unknown, baseUrl: string, _site: string, employer: AdapterEmployer): RawOpportunity[] {
  const jobs = (payload as { jobPostings?: WorkdayPosting[] })?.jobPostings;
  if (!Array.isArray(jobs)) throw new Error("Unexpected Workday payload: missing jobPostings");
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const j of jobs) {
    if (!j?.title || !j.externalPath) continue;
    const location = j.locationsText ?? "";
    if (!isUkLocation(location)) continue;
    const verdict = classifyPosting({ title: j.title, location }, fallback);
    if (!verdict.include) continue;
    const url = `${baseUrl}${j.externalPath}`;
    out.push({
      employer: employer.name, title: j.title.trim(), roleFamily: verdict.roleFamily,
      programmeType: verdict.programmeType,
      location: location || "London", status: "OPEN",
      summary: originalSummary({ title: j.title.trim(), employer: employer.name, atsLabel: "Workday careers", location: location || "UK" }),
      applicationUrl: url, sourceUrl: url, sourceType: "WORKDAY", tags: [],
    });
  }
  return out;
}

export class WorkdayAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "workday" }>, private readonly employer: AdapterEmployer) {
    this.id = `workday:${cfg.tenant}/${cfg.site}`;
  }
  async fetch(): Promise<RawDataset> {
    const endpoint = `https://${this.cfg.host}/wday/cxs/${this.cfg.tenant}/${this.cfg.site}/jobs`;
    const rows: RawOpportunity[] = [];
    let offset = 0, total = Infinity;
    const seen = new Set<string>();
    while (offset < total && offset < 2000) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; TrackrBot/1.0)" },
        body: JSON.stringify({ limit: 20, offset, searchText: "intern", appliedFacets: {} }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`POST ${endpoint} → ${res.status}`);
      const page = (await res.json()) as { total?: number; jobPostings?: WorkdayPosting[] };
      total = page.total ?? 0;
      const mapped = mapWorkdayJobs(page, `https://${this.cfg.host}`, this.cfg.site, this.employer);
      for (const r of mapped) { const k = r.applicationUrl ?? r.title; if (!seen.has(k)) { seen.add(k); rows.push(r); } }
      const count = page.jobPostings?.length ?? 0;
      if (count === 0) break;
      offset += count;
    }
    return buildDataset(this.id, this.employer, rows);
  }
}
