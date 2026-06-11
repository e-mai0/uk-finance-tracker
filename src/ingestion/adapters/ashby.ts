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
 * Live Ashby job-board adapter. Ashby is the ATS most startups and boutique
 * funds use, which makes this the workhorse for niche-firm coverage. Public
 * feed: `api.ashbyhq.com/posting-api/job-board/{name}`.
 */

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  department?: string;
  team?: string;
  employmentType?: string; // "Intern", "FullTime", …
  isListed?: boolean;
  jobUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
}

export function mapAshbyJobs(
  payload: unknown,
  employer: AdapterEmployer,
): RawOpportunity[] {
  const jobs = (payload as { jobs?: AshbyJob[] })?.jobs;
  if (!Array.isArray(jobs)) {
    throw new Error("Unexpected Ashby payload: missing `jobs` array");
  }
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const job of jobs) {
    if (!job?.title || job.isListed === false) continue;
    const url = job.jobUrl ?? job.applyUrl;
    if (!url) continue;
    // A role posted as "Remote" with a London secondary location still counts.
    const locations = [
      job.location ?? "",
      ...(job.secondaryLocations ?? []).map((l) => l?.location ?? ""),
    ].filter(Boolean);
    const location = locations.find((l) => l) ?? "";
    const departments = [job.department, job.team]
      .map((d) => d?.trim() ?? "")
      .filter(Boolean);
    const verdict = classifyPosting(
      {
        title: job.title,
        location: locations.join("; "),
        departments,
        employmentType: job.employmentType,
      },
      fallback,
    );
    if (!verdict.include) continue;

    const department = departments[0] ?? null;
    out.push({
      employer: employer.name,
      title: job.title.trim(),
      roleFamily: verdict.roleFamily,
      divisionDesk: department ?? undefined,
      location: location || "London",
      status: "OPEN",
      summary: originalSummary({
        title: job.title.trim(),
        employer: employer.name,
        atsLabel: "Ashby",
        department,
        location: location || "UK",
      }),
      applicationUrl: url,
      sourceUrl: url,
      sourceType: "ASHBY",
      firstSeen: job.publishedAt,
      tags: departments.map((d) => d.toLowerCase()),
    });
  }
  return out;
}

export class AshbyAdapter implements SourceAdapter {
  readonly id: string;

  constructor(
    private readonly boardName: string,
    private readonly employer: AdapterEmployer,
  ) {
    this.id = `ashby:${boardName}`;
  }

  async fetch(): Promise<RawDataset> {
    const payload = await fetchJson(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
        this.boardName,
      )}`,
    );
    return buildDataset(
      this.id,
      this.employer,
      mapAshbyJobs(payload, this.employer),
    );
  }
}
