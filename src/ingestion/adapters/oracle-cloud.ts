import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, fetchJson, originalSummary, type AdapterEmployer } from "./common";

interface OracleReq { Id: string; Title: string; PrimaryLocation?: string; PrimaryLocationCountry?: string }

export function mapOracleList(payload: unknown, employer: AdapterEmployer): RawOpportunity[] {
  const list = (payload as { items?: { requisitionList?: OracleReq[] }[] })?.items?.[0]?.requisitionList;
  if (!Array.isArray(list)) throw new Error("Unexpected Oracle payload: missing requisitionList");
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const r of list) {
    if (!r?.Id || !r.Title) continue;
    if ((r.PrimaryLocationCountry ?? "").toUpperCase() !== "GB") continue; // client-side UK filter
    const location = r.PrimaryLocation ?? "London";
    const verdict = classifyPosting({ title: r.Title, location }, fallback);
    if (!verdict.include) continue;
    out.push({
      employer: employer.name,
      title: r.Title.trim(),
      roleFamily: verdict.roleFamily,
      location,
      status: "OPEN",
      summary: originalSummary({ title: r.Title.trim(), employer: employer.name, atsLabel: "Oracle Cloud careers", location }),
      applicationUrl: `oracle:${r.Id}`, // placeholder Id, resolved to a real URL in fetch()
      sourceUrl: undefined,
      sourceType: "ORACLE_CLOUD",
      tags: [],
    });
  }
  return out;
}

/** Detail fetch → ExternalPostedEndDate (real deadline, ISO). */
export async function fetchOracleDeadline(host: string, site: string, id: string): Promise<{ deadline: string | null; url: string }> {
  const url = `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?onlyData=true&expand=all&finder=ById;Id=%22${id}%22,siteNumber=${site}`;
  const payload = (await fetchJson(url)) as { items?: { ExternalPostedEndDate?: string }[] };
  const end = payload?.items?.[0]?.ExternalPostedEndDate ?? null;
  const human = `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${id}`;
  return { deadline: end, url: human };
}

export class OracleCloudAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "oracle" }>, private readonly employer: AdapterEmployer) {
    this.id = `oracle:${cfg.host}/${cfg.site}`;
  }
  async fetch(): Promise<RawDataset> {
    const base = `https://${this.cfg.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=${this.cfg.site}`;
    const rows: RawOpportunity[] = [];
    let offset = 0, total = Infinity;
    while (offset < total) {
      const page = (await fetchJson(`${base},limit=200,offset=${offset}`)) as { items?: { TotalJobsCount?: number; requisitionList?: unknown[] }[] };
      total = page.items?.[0]?.TotalJobsCount ?? 0;
      const count = page.items?.[0]?.requisitionList?.length ?? 0;
      rows.push(...mapOracleList(page, this.employer));
      if (count === 0) break;
      offset += count;
    }
    for (const r of rows) {
      const id = (r.applicationUrl ?? "").replace("oracle:", "");
      const { deadline, url } = await fetchOracleDeadline(this.cfg.host, this.cfg.site, id);
      r.applicationUrl = url; r.sourceUrl = url;
      if (deadline) r.deadlineAt = deadline; // real deadline → normalize won't infer
    }
    return buildDataset(this.id, this.employer, rows);
  }
}
