import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting, isUkLocation } from "../classify";
import { buildDataset, fallbackFamilyFor, fetchJson, originalSummary, type AdapterEmployer } from "./common";

interface EfPos { id?: number | string; name?: string; title?: string; location?: string; locations?: string[];
  canonicalPositionUrl?: string; positionUrl?: string }

function rows(list: EfPos[], base: string, employer: AdapterEmployer): RawOpportunity[] {
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const p of list) {
    const title = p.name ?? p.title; if (!p.id || !title) continue;
    const location = p.location ?? p.locations?.[0] ?? "";
    if (!isUkLocation(location)) continue;
    const verdict = classifyPosting({ title, location }, fallback);
    if (!verdict.include) continue;
    const rel = p.canonicalPositionUrl ?? p.positionUrl ?? "";
    const url = rel.startsWith("http") ? rel : `${base}${rel}`;
    out.push({ employer: employer.name, title: title.trim(), roleFamily: verdict.roleFamily,
      location: location || "London", status: "OPEN",
      summary: originalSummary({ title: title.trim(), employer: employer.name, atsLabel: "careers site (Eightfold)", location: location || "UK" }),
      applicationUrl: url, sourceUrl: url, sourceType: "EIGHTFOLD", tags: [] });
  }
  return out;
}

/** Raw positions array for a page (shape differs per endpoint). */
export function positionsOf(payload: unknown, endpoint: "apply" | "pcsx"): EfPos[] {
  if (endpoint === "apply") return (payload as { positions?: EfPos[] })?.positions ?? [];
  return (payload as { data?: { positions?: EfPos[] } })?.data?.positions ?? [];
}

export function mapEightfold(payload: unknown, endpoint: "apply" | "pcsx", base: string, employer: AdapterEmployer): RawOpportunity[] {
  return rows(positionsOf(payload, endpoint), base, employer);
}

function count(payload: unknown, endpoint: "apply" | "pcsx"): number {
  return endpoint === "apply" ? ((payload as { count?: number }).count ?? 0) : ((payload as { data?: { count?: number } }).data?.count ?? 0);
}

export class EightfoldAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "eightfold" }>, private readonly employer: AdapterEmployer) {
    this.id = `eightfold:${cfg.domain}`;
  }
  async fetch(): Promise<RawDataset> {
    const path = this.cfg.endpoint === "apply" ? "/api/apply/v2/jobs" : "/api/pcsx/search";
    const base = `https://${this.cfg.host}`;
    const all: RawOpportunity[] = [];
    // Advance by the actual number of positions returned per page (page size is
    // server-controlled, not a fixed 10), so we never skip or overlap rows.
    let start = 0, total = Infinity;
    while (start < total && start < 5000) {
      const payload = await fetchJson(`${base}${path}?domain=${this.cfg.domain}&query=intern&location=London&start=${start}`);
      total = count(payload, this.cfg.endpoint);
      const page = positionsOf(payload, this.cfg.endpoint);
      all.push(...rows(page, base, this.employer));
      if (page.length === 0) break; // no more rows (covers off-season count:0 too)
      start += page.length;
    }
    return buildDataset(this.id, this.employer, all);
  }
}
