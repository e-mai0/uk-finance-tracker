import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import { classifyPosting } from "../classify";
import {
  buildDataset,
  fallbackFamilyFor,
  fetchJson,
  originalSummary,
  type AdapterEmployer,
} from "./common";

/**
 * Live Lever postings adapter. Lever exposes a public JSON feed per site
 * (`api.lever.co/v0/postings/{site}?mode=json`); we keep only UK finance
 * summer internships (see ingestion/classify) and map onto RawOpportunity.
 */

interface LeverPosting {
  id: string;
  text: string; // title
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number; // epoch ms
  categories?: {
    commitment?: string;
    department?: string;
    team?: string;
    location?: string;
  };
  descriptionPlain?: string;
}

export function mapLeverPostings(
  payload: unknown,
  employer: AdapterEmployer,
): RawOpportunity[] {
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected Lever payload: expected an array of postings");
  }
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const posting of payload as LeverPosting[]) {
    if (!posting?.text) continue;
    const url = posting.hostedUrl ?? posting.applyUrl;
    if (!url) continue;
    const location = posting.categories?.location?.trim() || "";
    const departments = [posting.categories?.department, posting.categories?.team]
      .map((d) => d?.trim() ?? "")
      .filter(Boolean);
    const verdict = classifyPosting(
      {
        title: posting.text,
        location,
        departments,
        employmentType: posting.categories?.commitment,
        descriptionText: posting.descriptionPlain,
      },
      fallback,
    );
    if (!verdict.include) continue;

    const department = departments[0] ?? null;
    out.push({
      employer: employer.name,
      title: posting.text.trim(),
      roleFamily: verdict.roleFamily,
      programmeType: verdict.programmeType,
      region: verdict.region,
      divisionDesk: department ?? undefined,
      location: location || "London",
      status: "OPEN",
      summary: originalSummary({
        title: posting.text.trim(),
        employer: employer.name,
        atsLabel: "Lever",
        department,
        location: location || "UK",
      }),
      applicationUrl: url,
      sourceUrl: url,
      sourceType: "LEVER",
      firstSeen: posting.createdAt
        ? new Date(posting.createdAt).toISOString()
        : undefined,
      tags: departments.map((d) => d.toLowerCase()),
    });
  }
  return out;
}

export class LeverAdapter implements SourceAdapter {
  readonly id: string;

  constructor(
    private readonly site: string,
    private readonly employer: AdapterEmployer,
  ) {
    this.id = `lever:${site}`;
  }

  async fetch(): Promise<RawDataset> {
    const payload = await fetchJson(
      `https://api.lever.co/v0/postings/${encodeURIComponent(this.site)}?mode=json`,
    );
    return buildDataset(
      this.id,
      this.employer,
      mapLeverPostings(payload, this.employer),
    );
  }
}
