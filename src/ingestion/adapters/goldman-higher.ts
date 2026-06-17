import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, originalSummary, type AdapterEmployer } from "./common";

interface GsRole { jobTitle?: string; division?: string; locations?: { city?: string; country?: string }[]; externalSource?: { sourceId?: string } }

export function mapGoldmanRoles(payload: unknown, employer: AdapterEmployer): RawOpportunity[] {
  const items = (payload as { data?: { roleSearch?: { items?: GsRole[] } } })?.data?.roleSearch?.items;
  if (!Array.isArray(items)) throw new Error("Unexpected Goldman payload: missing roleSearch.items");
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const r of items) {
    if (!r?.jobTitle) continue;
    const loc = r.locations?.find((l) => /united kingdom|london|uk\b/i.test(`${l.city} ${l.country}`));
    if (!loc) continue;
    const verdict = classifyPosting({ title: r.jobTitle, location: `${loc.city} ${loc.country}`, departments: r.division ? [r.division] : [] }, fallback);
    if (!verdict.include) continue;
    const url = `https://higher.gs.com/roles/${r.externalSource?.sourceId ?? ""}`;
    out.push({ employer: employer.name, title: r.jobTitle.trim(), roleFamily: verdict.roleFamily,
      programmeType: verdict.programmeType, region: verdict.region,
      divisionDesk: r.division?.trim() || undefined, location: loc.city ?? "London", status: "OPEN",
      summary: originalSummary({ title: r.jobTitle.trim(), employer: employer.name, atsLabel: "Goldman Sachs careers (higher.gs.com)", department: r.division ?? null, location: loc.city ?? "London" }),
      applicationUrl: url, sourceUrl: url, sourceType: "CAREERS_PAGE", tags: [] });
  }
  return out;
}

const QUERY = `query($i: RoleSearchQueryInput!){ roleSearch(searchQueryInput:$i){ totalCount items{ roleId jobTitle division locations{ city country } externalSource{ sourceId } } } }`;

export class GoldmanHigherAdapter implements SourceAdapter {
  readonly id = "goldman:higher-gs";
  constructor(private readonly employer: AdapterEmployer) {}
  async fetch(): Promise<RawDataset> {
    const all: RawOpportunity[] = [];
    let page = 0, total = Infinity;
    while (page * 50 < total && page < 20) {
      const res = await fetch("https://api-higher.gs.com/gateway/api/v1/graphql", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (compatible; TrackrBot/1.0)" },
        body: JSON.stringify({ query: QUERY, variables: { i: { page: { pageSize: 50, pageNumber: page }, experiences: ["CAMPUS"], searchTerm: "summer internship" } } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Goldman GraphQL → ${res.status}`);
      const payload = (await res.json()) as { data?: { roleSearch?: { totalCount?: number } } };
      total = payload.data?.roleSearch?.totalCount ?? 0;
      all.push(...mapGoldmanRoles(payload, this.employer));
      page += 1;
      if (total === 0) break;
    }
    return buildDataset(this.id, this.employer, all);
  }
}
