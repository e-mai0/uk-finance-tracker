import type { RawDataset, SourceAdapter } from "../types";
import { extractJobPostings, mapJobPostings } from "../jsonld";
import { buildDataset, fetchText, type AdapterEmployer } from "./common";

/**
 * Adapter for custom careers sites that embed schema.org JobPosting JSON-LD
 * (TalentBrew/Radancy, Avature, most modern boutique sites). The page is the
 * feed: we fetch it, read the structured data, and import what classifies as
 * a UK finance summer internship.
 */
export class JsonLdPageAdapter implements SourceAdapter {
  readonly id: string;

  constructor(
    private readonly pageUrl: string,
    identifier: string,
    private readonly employer: AdapterEmployer,
  ) {
    this.id = `jsonld:${identifier}`;
  }

  async fetch(): Promise<RawDataset> {
    const html = await fetchText(this.pageUrl);
    const postings = extractJobPostings(html);
    return buildDataset(
      this.id,
      this.employer,
      mapJobPostings(postings, this.employer, this.pageUrl),
    );
  }
}
