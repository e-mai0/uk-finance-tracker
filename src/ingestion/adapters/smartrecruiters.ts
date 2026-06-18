import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting } from "../classify";
import {
  buildDataset,
  fallbackFamilyFor,
  fetchJson,
  originalSummary,
  type AdapterEmployer,
} from "./common";

/**
 * SmartRecruiters public Posting API adapter.
 *
 * Endpoint: GET https://api.smartrecruiters.com/v1/companies/{company}/postings
 * Returns `{ offset, limit, totalFound, content[] }`; each posting carries a
 * nested `location` / `department` / `function` / `typeOfEmployment`. The list
 * API does NOT expose the public job URL (only an `ref` to the API), so we
 * rebuild the canonical apply link `https://jobs.smartrecruiters.com/{co}/{id}`.
 */
interface SmartRecruiterPosting {
  id?: string;
  name?: string;
  releasedDate?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    fullLocation?: string;
  };
  department?: { label?: string };
  function?: { label?: string };
  typeOfEmployment?: { label?: string };
  company?: { identifier?: string };
}

interface SmartRecruiterPage {
  totalFound?: number;
  offset?: number;
  limit?: number;
  content?: SmartRecruiterPosting[];
}

export function mapSmartRecruiterPostings(
  payload: unknown,
  company: string,
  employer: AdapterEmployer,
): RawOpportunity[] {
  const content = (payload as SmartRecruiterPage)?.content;
  if (!Array.isArray(content)) {
    throw new Error("Unexpected SmartRecruiters payload: missing `content` array");
  }
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const p of content) {
    if (!p?.id || !p.name) continue;
    const location =
      p.location?.fullLocation?.trim() ||
      [p.location?.city, p.location?.region, p.location?.country]
        .map((s) => s?.trim() ?? "")
        .filter(Boolean)
        .join(", ");
    const departments = [p.department?.label, p.function?.label]
      .map((d) => d?.trim() ?? "")
      .filter(Boolean);
    const verdict = classifyPosting(
      {
        title: p.name,
        location,
        departments,
        employmentType: p.typeOfEmployment?.label,
      },
      fallback,
    );
    if (!verdict.include) continue;

    const co = p.company?.identifier?.trim() || company;
    const url = `https://jobs.smartrecruiters.com/${co}/${p.id}`;
    const department = departments[0] ?? null;
    out.push({
      employer: employer.name,
      title: p.name.trim(),
      roleFamily: verdict.roleFamily,
      programmeType: verdict.programmeType,
      divisionDesk: department ?? undefined,
      location: location || "London",
      status: "OPEN",
      summary: originalSummary({
        title: p.name.trim(),
        employer: employer.name,
        atsLabel: "SmartRecruiters",
        department,
        location: location || "UK",
      }),
      applicationUrl: url,
      sourceUrl: url,
      sourceType: "SMARTRECRUITERS",
      firstSeen: p.releasedDate,
      tags: departments.map((d) => d.toLowerCase()),
    });
  }
  return out;
}

export class SmartRecruitersAdapter implements SourceAdapter {
  readonly id: string;
  constructor(
    private readonly cfg: Extract<SourceConfig, { ats: "smartrecruiters" }>,
    private readonly employer: AdapterEmployer,
  ) {
    this.id = `smartrecruiters:${cfg.company}`;
  }

  async fetch(): Promise<RawDataset> {
    const limit = 100;
    const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(
      this.cfg.company,
    )}/postings`;
    const rows: RawOpportunity[] = [];
    const seen = new Set<string>();
    let offset = 0;
    let total = Infinity;
    // Cap the crawl so a huge board can't run away; UK intern slices are small.
    while (offset < total && offset < 2000) {
      const page = (await fetchJson(
        `${base}?limit=${limit}&offset=${offset}`,
      )) as SmartRecruiterPage;
      total = page.totalFound ?? 0;
      const mapped = mapSmartRecruiterPostings(page, this.cfg.company, this.employer);
      for (const r of mapped) {
        const k = r.applicationUrl ?? r.title;
        if (!seen.has(k)) {
          seen.add(k);
          rows.push(r);
        }
      }
      const count = page.content?.length ?? 0;
      if (count === 0) break;
      offset += count;
    }
    return buildDataset(this.id, this.employer, rows);
  }
}
