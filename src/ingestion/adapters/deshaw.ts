import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import { classifyPosting } from "../classify";
import {
  buildDataset,
  fallbackFamilyFor,
  fetchText,
  originalSummary,
  type AdapterEmployer,
} from "./common";

/**
 * The D. E. Shaw group runs a custom Next.js careers app. Its `/careers` page is
 * server-rendered: the full opening list is embedded in the page's
 * `__NEXT_DATA__` JSON blob (pageProps.internships + pageProps.regularJobs), so a
 * plain server-side fetch returns the data with no headless browser. Verified
 * live 2026-06-19 — the blob carried live London early-careers internships
 * (Trader/Analyst, Investor Relations — Summer 2027). This is the
 * `hidden_xhr_or_fetch` strategy pinned to the SSR payload the page itself ships.
 *
 * Each job carries: displayName, office[{abbreviation,name}], category[string],
 * and a `data` object with the canonical slug (`jobUrl`), `validFromDate`,
 * `validToDate` (the application deadline, often null = rolling), `isActive`, and
 * `closingDateNotPassed`. We only emit jobs that are still active and open, and
 * classify.ts gates the rest to UK early-careers finance roles.
 */

const LISTING_URL = "https://www.deshaw.com/careers";

interface DeShawOffice {
  abbreviation?: string | null;
  name?: string | null;
}

interface DeShawJob {
  id: number;
  displayName?: string;
  office?: DeShawOffice[];
  category?: string[];
  data?: {
    jobUrl?: string | null;
    validFromDate?: string | null;
    validToDate?: string | null;
    isActive?: boolean;
    closingDateNotPassed?: boolean;
  };
}

export interface DeShawNextData {
  internships: DeShawJob[];
  regularJobs: DeShawJob[];
}

/** Extract and parse the `__NEXT_DATA__` blob from a D. E. Shaw careers page. */
export function parseDeShawNextData(html: string): DeShawNextData {
  const m = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) {
    throw new Error("D. E. Shaw careers page: no __NEXT_DATA__ blob found");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1]);
  } catch {
    throw new Error("D. E. Shaw careers page: __NEXT_DATA__ was not valid JSON");
  }
  const pageProps =
    (parsed as { props?: { pageProps?: Record<string, unknown> } })?.props
      ?.pageProps ?? {};
  const asJobs = (v: unknown): DeShawJob[] =>
    Array.isArray(v) ? (v as DeShawJob[]) : [];
  return {
    internships: asJobs(pageProps.internships),
    regularJobs: asJobs(pageProps.regularJobs),
  };
}

/** Map D. E. Shaw internship records to classified UK early-careers postings. */
export function mapDeShawInternships(
  jobs: DeShawJob[],
  employer: AdapterEmployer,
): RawOpportunity[] {
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const job of jobs) {
    const title = job.displayName?.trim();
    const slug = job.data?.jobUrl?.trim();
    if (!title || !slug) continue;
    // Only surface roles the site itself still shows as open. A closed listing
    // (isActive=false / closingDateNotPassed=false) resolves by URL but must not
    // re-appear as a live opportunity.
    if (job.data?.isActive === false) continue;
    if (job.data?.closingDateNotPassed === false) continue;

    const location =
      (job.office ?? [])
        .map((o) => o?.name?.trim())
        .filter(Boolean)
        .join(", ") || "";
    const departments = (job.category ?? [])
      .map((c) => c?.trim())
      .filter((c): c is string => Boolean(c));

    const verdict = classifyPosting(
      {
        title,
        location,
        departments,
        employmentType: "Intern",
      },
      fallback,
    );
    if (!verdict.include) continue;

    const url = `https://www.deshaw.com/careers/${slug}`;
    const deadline = job.data?.validToDate?.trim() || null;
    out.push({
      employer: employer.name,
      title,
      roleFamily: verdict.roleFamily,
      programmeType: verdict.programmeType,
      divisionDesk: departments[0] || undefined,
      location: location || "London",
      status: "OPEN",
      deadlineAt: deadline,
      summary: originalSummary({
        title,
        employer: employer.name,
        atsLabel: "careers site",
        department: departments[0] ?? null,
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

export class DeShawAdapter implements SourceAdapter {
  readonly id = "deshaw:careers-next";

  constructor(private readonly employer: AdapterEmployer) {}

  async fetch(): Promise<RawDataset> {
    const html = await fetchText(LISTING_URL);
    const { internships, regularJobs } = parseDeShawNextData(html);
    // Internships are the early-careers bucket; regularJobs occasionally carry
    // graduate/analyst roles too, so classify both and let the UK/early-careers
    // gate decide. dedupe by application URL.
    const mapped = [
      ...mapDeShawInternships(internships, this.employer),
      ...mapDeShawInternships(regularJobs, this.employer),
    ];
    const seen = new Set<string>();
    const deduped = mapped.filter((o) => {
      const k = o.applicationUrl ?? o.title;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return buildDataset(this.id, this.employer, deduped);
  }
}
