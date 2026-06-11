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
 * Jane Street publishes internships on its own site, NOT on its Greenhouse
 * board (which carries only experienced/new-grad roles — see the source plan).
 * The site is driven by a public JSON feed at /jobs/main.json with stable ids
 * that map to /join-jane-street/position/<id>/ — both verified live. This is
 * the `hidden_xhr_or_fetch` strategy from source-plans, pinned to one
 * deliberately-public endpoint rather than generic scraping.
 */

const FEED_URL = "https://www.janestreet.com/jobs/main.json";

interface JaneStreetJob {
  id: number;
  position?: string; // title
  category?: string; // e.g. "Trading, Research, and Machine Learning"
  team?: string;
  availability?: string; // e.g. "Summer Internship", "Full-Time: Experienced"
  city?: string; // "LDN" | "NYC" | "HKG" | …
  overview?: string;
}

const CITY_NAMES: Record<string, string> = {
  LDN: "London",
  LON: "London",
  NYC: "New York",
  HKG: "Hong Kong",
  SGP: "Singapore",
  AMS: "Amsterdam",
};

export function mapJaneStreetJobs(
  payload: unknown,
  employer: AdapterEmployer,
): RawOpportunity[] {
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected Jane Street payload: expected an array of jobs");
  }
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const job of payload as JaneStreetJob[]) {
    if (!job?.id || !job.position) continue;
    const availability = job.availability ?? "";
    // The feed mixes hemispheres: "Winter Internship" and "Summer Internship
    // (December–February)" are the HK/Sydney cycles, not the UK summer one.
    if (/winter|december/i.test(availability)) continue;
    const location = CITY_NAMES[job.city ?? ""] ?? job.city ?? "";
    const departments = [job.category, job.team]
      .map((d) => d?.trim() ?? "")
      .filter(Boolean);
    const verdict = classifyPosting(
      {
        title: job.position,
        location,
        departments,
        employmentType: availability,
        descriptionText: job.overview,
      },
      fallback,
    );
    if (!verdict.include) continue;

    const url = `https://www.janestreet.com/join-jane-street/position/${job.id}/`;
    out.push({
      employer: employer.name,
      title: `${job.position.trim()} — Summer Internship`,
      roleFamily: verdict.roleFamily,
      divisionDesk: job.category?.trim() || undefined,
      location: location || "London",
      status: "OPEN",
      summary: originalSummary({
        title: job.position.trim(),
        employer: employer.name,
        atsLabel: "careers site (public JSON feed)",
        department: job.category ?? null,
        location: location || "UK",
      }),
      applicationUrl: url,
      sourceUrl: url,
      sourceType: "CAREERS_PAGE",
      tags: departments.map((d) => d.toLowerCase()),
    });
  }
  return out;
}

export class JaneStreetAdapter implements SourceAdapter {
  readonly id = "janestreet:jobs-json";

  constructor(private readonly employer: AdapterEmployer) {}

  async fetch(): Promise<RawDataset> {
    const payload = await fetchJson(FEED_URL);
    return buildDataset(
      this.id,
      this.employer,
      mapJaneStreetJobs(payload, this.employer),
    );
  }
}
