import type { RawOpportunity } from "./types";
import { classifyPosting } from "./classify";
import { fallbackFamilyFor, originalSummary, type AdapterEmployer } from "./adapters/common";

/**
 * Extract schema.org JobPosting structured data (JSON-LD) from a careers
 * page. Sites on TalentBrew/Radancy, Avature and most modern boutique careers
 * sites embed this specifically so crawlers (Google Jobs) can read postings —
 * it is the machine-readable surface for "custom ATS" employers, and it
 * carries real deadlines (`validThrough`) the ATS board APIs don't expose.
 */

interface JsonLdJobPosting {
  title?: string;
  url?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string | string[];
  jobLocation?: unknown;
}

function isJobPosting(node: unknown): node is JsonLdJobPosting {
  if (!node || typeof node !== "object") return false;
  const t = (node as { "@type"?: string | string[] })["@type"];
  return Array.isArray(t) ? t.includes("JobPosting") : t === "JobPosting";
}

/** Walk a parsed JSON-LD document (object, array or @graph) for JobPostings. */
function collect(node: unknown, out: JsonLdJobPosting[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (isJobPosting(node)) out.push(node);
  const graph = (node as { "@graph"?: unknown })["@graph"];
  if (graph) collect(graph, out);
}

export function extractJobPostings(html: string): JsonLdJobPosting[] {
  const out: JsonLdJobPosting[] = [];
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      collect(JSON.parse(m[1]), out);
    } catch {
      // Malformed JSON-LD block — skip it, other blocks may still parse.
    }
  }
  return out;
}

/** Flatten schema.org jobLocation (Place | Place[] | string) into one string. */
export function jobLocationToString(loc: unknown): string {
  if (!loc) return "";
  if (typeof loc === "string") return loc;
  if (Array.isArray(loc)) {
    return loc.map(jobLocationToString).filter(Boolean).join("; ");
  }
  if (typeof loc === "object") {
    const place = loc as {
      name?: string;
      address?:
        | string
        | {
            addressLocality?: string;
            addressRegion?: string;
            addressCountry?: string | { name?: string };
          };
    };
    if (typeof place.address === "string") return place.address;
    if (place.address && typeof place.address === "object") {
      const a = place.address;
      const country =
        typeof a.addressCountry === "string"
          ? a.addressCountry
          : a.addressCountry?.name ?? "";
      return [a.addressLocality, a.addressRegion, country]
        .filter(Boolean)
        .join(", ");
    }
    return place.name ?? "";
  }
  return "";
}

function stripHtml(html: string | undefined): string {
  return (html ?? "").replace(/<[^>]*>/g, " ");
}

export function mapJobPostings(
  postings: JsonLdJobPosting[],
  employer: AdapterEmployer,
  pageUrl: string,
): RawOpportunity[] {
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const p of postings) {
    if (!p.title) continue;
    const location = jobLocationToString(p.jobLocation);
    const employmentType = Array.isArray(p.employmentType)
      ? p.employmentType.join(" ")
      : p.employmentType;
    const verdict = classifyPosting(
      {
        title: p.title,
        location,
        employmentType,
        descriptionText: stripHtml(p.description),
      },
      fallback,
    );
    if (!verdict.include) continue;

    const url = p.url ?? pageUrl;
    out.push({
      employer: employer.name,
      title: p.title.trim(),
      roleFamily: verdict.roleFamily,
      programmeType: verdict.programmeType,
      location: location || "London",
      status: "OPEN",
      opensAt: null,
      deadlineAt: p.validThrough ?? null,
      firstSeen: p.datePosted,
      summary: originalSummary({
        title: p.title.trim(),
        employer: employer.name,
        atsLabel: "careers site (structured data)",
        location: location || "UK",
      }),
      applicationUrl: url,
      sourceUrl: pageUrl,
      sourceType: "CAREERS_PAGE",
      tags: [],
    });
  }
  return out;
}
