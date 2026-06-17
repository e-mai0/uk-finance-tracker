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
 * Live Greenhouse job-board adapter. Greenhouse exposes a public JSON API per
 * board token (`boards-api.greenhouse.io/v1/boards/{token}/jobs`); we pull it,
 * keep only UK finance summer internships (see ingestion/classify), and map
 * each posting onto RawOpportunity for the shared import pipeline.
 */

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  location?: { name?: string };
  departments?: { name?: string }[];
  /** HTML description — used for classification only, never republished. */
  content?: string;
}

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  // Greenhouse double-escapes entities inside `content`; a rough strip is
  // plenty for keyword classification.
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ");
}

export function mapGreenhouseJobs(
  payload: unknown,
  employer: AdapterEmployer,
): RawOpportunity[] {
  const jobs = (payload as { jobs?: GreenhouseJob[] })?.jobs;
  if (!Array.isArray(jobs)) {
    throw new Error("Unexpected Greenhouse payload: missing `jobs` array");
  }
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const job of jobs) {
    if (!job?.title || !job.absolute_url) continue;
    const location = job.location?.name?.trim() || "";
    const departments = (job.departments ?? [])
      .map((d) => d?.name?.trim() ?? "")
      .filter(Boolean);
    const verdict = classifyPosting(
      {
        title: job.title,
        location,
        departments,
        descriptionText: stripHtml(job.content),
      },
      fallback,
    );
    if (!verdict.include) continue;

    const department = departments[0] ?? null;
    out.push({
      employer: employer.name,
      title: job.title.trim(),
      roleFamily: verdict.roleFamily,
      programmeType: verdict.programmeType,
      divisionDesk: department ?? undefined,
      location: location || "London",
      status: "OPEN",
      summary: originalSummary({
        title: job.title.trim(),
        employer: employer.name,
        atsLabel: "Greenhouse",
        department,
        location: location || "UK",
      }),
      applicationUrl: job.absolute_url,
      sourceUrl: job.absolute_url,
      sourceType: "GREENHOUSE",
      lastSeen: job.updated_at,
      tags: departments.map((d) => d.toLowerCase()),
    });
  }
  return out;
}

export class GreenhouseAdapter implements SourceAdapter {
  readonly id: string;

  constructor(
    private readonly boardToken: string,
    private readonly employer: AdapterEmployer,
  ) {
    this.id = `greenhouse:${boardToken}`;
  }

  async fetch(): Promise<RawDataset> {
    const payload = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
        this.boardToken,
      )}/jobs?content=true`,
    );
    return buildDataset(
      this.id,
      this.employer,
      mapGreenhouseJobs(payload, this.employer),
    );
  }
}
