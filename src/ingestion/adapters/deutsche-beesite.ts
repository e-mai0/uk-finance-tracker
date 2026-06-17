import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, fetchJson, originalSummary, type AdapterEmployer } from "./common";

interface BeesiteItem { MatchedObjectDescriptor?: {
  PositionID?: string; PositionTitle?: string;
  PositionLocation?: { CountryCode?: string; CityName?: string }[];
  PublicationEndDate?: string; ApplyURI?: string[]; } }

export function mapBeesite(payload: unknown, employer: AdapterEmployer): RawOpportunity[] {
  const items = (payload as { SearchResult?: { SearchResultItems?: BeesiteItem[] } })?.SearchResult?.SearchResultItems;
  if (!Array.isArray(items)) throw new Error("Unexpected Beesite payload: missing SearchResultItems");
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const it of items) {
    const d = it.MatchedObjectDescriptor;
    if (!d?.PositionID || !d.PositionTitle) continue;
    const locs = d.PositionLocation ?? [];
    if (!locs.some((l) => (l.CountryCode ?? "").toUpperCase() === "GB")) continue;
    const location = locs.find((l) => l.CountryCode === "GB")?.CityName ?? "London";
    const verdict = classifyPosting({ title: d.PositionTitle, location }, fallback);
    if (!verdict.include) continue;
    const end = d.PublicationEndDate;
    const deadline = end && !end.startsWith("2099") ? end.slice(0, 10) : undefined;
    const url = d.ApplyURI?.[0];
    out.push({
      employer: employer.name, title: d.PositionTitle.trim(), roleFamily: verdict.roleFamily,
      programmeType: verdict.programmeType, region: verdict.region,
      location, status: "OPEN",
      summary: originalSummary({ title: d.PositionTitle.trim(), employer: employer.name, atsLabel: "Deutsche Bank careers (Beesite)", location }),
      applicationUrl: url, sourceUrl: url, sourceType: "CAREERS_PAGE",
      deadlineAt: deadline, tags: [],
    });
  }
  return out;
}

const DATA = encodeURIComponent(JSON.stringify({
  LanguageCode: "en",
  SearchParameters: { FirstItem: 1, CountItem: 100, MatchedObjectDescriptor: [
    "PositionID","PositionTitle","PositionLocation","PublicationStartDate","PublicationEndDate","ApplyURI","CareerLevel" ] },
  SearchCriteria: [],
}));

export class DeutscheBankBeesiteAdapter implements SourceAdapter {
  readonly id = "beesite:deutsche-bank";
  constructor(private readonly employer: AdapterEmployer) {}
  async fetch(): Promise<RawDataset> {
    const payload = await fetchJson(`https://api-deutschebank.beesite.de/graduatesearch/?data=${DATA}`);
    return buildDataset(this.id, this.employer, mapBeesite(payload, this.employer));
  }
}
