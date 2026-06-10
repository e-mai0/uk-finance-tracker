import type { RoleFamily } from "@prisma/client";
import type { RawDataset, RawEmployer, RawOpportunity } from "../types";
import { roleFamilyFromSector } from "../classify";

/** Identity of the employer a live board belongs to, supplied by the source
 *  registry row so adapters can emit a complete RawDataset. */
export interface AdapterEmployer {
  name: string;
  sector?: string | null;
  website?: string | null;
}

export function fallbackFamilyFor(employer: AdapterEmployer): RoleFamily | null {
  return roleFamilyFromSector(employer.sector);
}

/** Fetch a public ATS JSON endpoint with a hard timeout. Throws on non-2xx so
 *  the sync layer can record the failure against the source. */
export async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Original, templated summary. Live boards expose employer-written copy which
 * we deliberately do NOT republish (descriptions are used only to classify);
 * this keeps the "no copied content" guarantee the curated dataset makes.
 */
export function originalSummary(opts: {
  title: string;
  employer: string;
  atsLabel: string;
  department?: string | null;
  location: string;
}): string {
  const dept = opts.department ? ` within ${opts.department}` : "";
  return (
    `${opts.title} at ${opts.employer}${dept}, based in ${opts.location}. ` +
    `Listed live on the employer's ${opts.atsLabel} job board — see the ` +
    `application link for the full description and requirements.`
  );
}

export function buildDataset(
  sourceId: string,
  employer: AdapterEmployer,
  opportunities: RawOpportunity[],
): RawDataset {
  const rawEmployer: RawEmployer = {
    name: employer.name,
    sector: employer.sector ?? undefined,
    website: employer.website ?? undefined,
  };
  return { source: sourceId, employers: [rawEmployer], opportunities };
}
