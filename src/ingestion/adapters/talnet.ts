import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, fetchTextRobust, originalSummary, type AdapterEmployer } from "./common";

const MONTHS: Record<string, string> = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };

/** Parse a tal.net deadline string (dd/mm/yyyy or 'd Mon yyyy') to ISO YYYY-MM-DD, or null. */
export function parseTalNetDeadline(text: string): string | null {
  const dmy = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  const named = text.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (named) { const m = MONTHS[named[2].toLowerCase()]; if (m) return `${named[3]}-${m}-${named[1].padStart(2,"0")}`; }
  return null;
}

const OPP_RE = /href="(\/vx\/[^"]*?\/opp\/(\d+)-[^"]*?\/en-GB)"[^>]*>\s*([^<]+?)\s*</gi;

export function mapTalNetBoard(html: string, baseUrl: string, employer: AdapterEmployer): RawOpportunity[] {
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(OPP_RE)) {
    const [, path, id, rawTitle] = m;
    if (seen.has(id)) continue;
    seen.add(id);
    const title = rawTitle.replace(/\s+/g, " ").trim();
    const verdict = classifyPosting({ title, location: title }, fallback);
    if (!verdict.include) continue;
    const after = html.slice(m.index ?? 0, (m.index ?? 0) + 600);
    const deadline = parseTalNetDeadline(after) ?? undefined;
    const url = `${baseUrl}${path}`;
    out.push({
      employer: employer.name, title, roleFamily: verdict.roleFamily,
      location: /london/i.test(title) ? "London" : "UK", status: "OPEN",
      summary: originalSummary({ title, employer: employer.name, atsLabel: "careers job board (tal.net)", location: "London" }),
      applicationUrl: url, sourceUrl: url, sourceType: "TALNET",
      deadlineAt: deadline, tags: [],
    });
  }
  return out;
}

export class TalNetAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "talnet" }>, private readonly employer: AdapterEmployer) {
    this.id = `talnet:${cfg.host}/${cfg.board}`;
  }
  async fetch(): Promise<RawDataset> {
    const board = `https://${this.cfg.host}/candidate/jobboard/vacancy/${this.cfg.board}/adv/`;
    const html = await fetchTextRobust(board);
    return buildDataset(this.id, this.employer, mapTalNetBoard(html, `https://${this.cfg.host}`, this.employer));
  }
}
