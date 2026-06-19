import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting, isUkLocation } from "../classify";
import { buildDataset, fallbackFamilyFor, originalSummary, type AdapterEmployer } from "./common";
import { mapPool } from "../pool";

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

// Workday's CXS endpoint treats `searchText` as a SERVER-SIDE full-text filter,
// so the previous single `searchText:"intern"` query DROPPED every early-careers
// posting whose title lacks the "intern" substring ("Summer Analyst", "Off-Cycle
// Analyst", "Spring Insight", …) before classify.ts ever saw it — the root cause
// of Blackstone's London "Summer Analyst" roles never appearing in the tracker.
//
// Fix: broaden the fetch with a SHORT union of finance early-careers terms rather
// than a single term, then let classify.ts (the SOLE include/exclude gate) decide.
// Chosen over `searchText:""` deliberately: the full-site tenants (Morgan Stanley
// `External`, Barclays `External_Career_Site_Barclays`) carry THOUSANDS of
// postings, and an empty search would page the whole tenant up to the cap and
// flood classify with irrelevant rows. Each term's result set is far smaller, the
// terms overlap heavily on the small campus tenants (so dedup keeps output tight),
// and the per-term `offset < 2000` cap is preserved unchanged, keeping every
// crawl bounded. Rows are deduped by applicationUrl across terms.
const EARLY_CAREERS_TERMS = ["intern", "analyst", "graduate", "summer", "placement", "insight"] as const;

// The term crawls are independent of one another, so fetch them with bounded
// concurrency rather than strictly serially. The bound (≤ the term count) keeps
// the burst on huge tenants sane and never exceeds what a single term already
// fired, while a rejected page still aborts the whole adapter (mapPool propagates
// the rejection — matching the original serial loop's throw-on-non-ok / throw-on-
// network-error semantics). Determinism is preserved by merging each term's
// (ordered) results back in EARLY_CAREERS_TERMS order with the same cross-term
// applicationUrl dedup, so the published set + order do not depend on which
// term's fetch finishes first.
const WORKDAY_TERM_CONCURRENCY = EARLY_CAREERS_TERMS.length;

export class WorkdayAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "workday" }>, private readonly employer: AdapterEmployer) {
    this.id = `workday:${cfg.tenant}/${cfg.site}`;
  }
  /** Crawl a single search term's paged result set, returning its mapped rows in
   *  page-then-list order with intra-term applicationUrl dedup. Throws on any
   *  non-ok response or network error, exactly as the original serial loop did. */
  private async fetchTerm(endpoint: string, searchText: string): Promise<RawOpportunity[]> {
    const out: RawOpportunity[] = [];
    const seenInTerm = new Set<string>();
    let offset = 0, total = Infinity;
    // Per-term safety cap UNCHANGED from the original loop (offset < 2000).
    while (offset < total && offset < 2000) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; TrackrBot/1.0)" },
        body: JSON.stringify({ limit: 20, offset, searchText, appliedFacets: {} }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`POST ${endpoint} → ${res.status}`);
      const page = (await res.json()) as { total?: number; jobPostings?: WorkdayPosting[] };
      total = page.total ?? 0;
      const mapped = mapWorkdayJobs(page, `https://${this.cfg.host}`, this.cfg.site, this.employer);
      for (const r of mapped) { const k = r.applicationUrl ?? r.title; if (!seenInTerm.has(k)) { seenInTerm.add(k); out.push(r); } }
      const count = page.jobPostings?.length ?? 0;
      if (count === 0) break;
      offset += count;
    }
    return out;
  }

  async fetch(): Promise<RawDataset> {
    const endpoint = `https://${this.cfg.host}/wday/cxs/${this.cfg.tenant}/${this.cfg.site}/jobs`;
    // Crawl the terms with bounded concurrency; mapPool preserves term order in
    // the returned array so the cross-term merge below is deterministic.
    const perTerm = await mapPool(
      EARLY_CAREERS_TERMS as readonly string[] as string[],
      WORKDAY_TERM_CONCURRENCY,
      (searchText) => this.fetchTerm(endpoint, searchText),
    );
    // Merge in EARLY_CAREERS_TERMS order with the same cross-term dedup the serial
    // loop applied (first occurrence — earliest term, earliest page — wins).
    const rows: RawOpportunity[] = [];
    const seen = new Set<string>();
    for (const termRows of perTerm) {
      for (const r of termRows) { const k = r.applicationUrl ?? r.title; if (!seen.has(k)) { seen.add(k); rows.push(r); } }
    }
    return buildDataset(this.id, this.employer, rows);
  }
}
