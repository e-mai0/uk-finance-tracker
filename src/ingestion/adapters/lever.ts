import type { RawDataset, SourceAdapter } from "../types";

/**
 * Stub for a future Lever postings adapter.
 *
 * Lever exposes `https://api.lever.co/v0/postings/{company}?mode=json`. A real
 * implementation would fetch, filter to UK finance summer internships, and map
 * each posting onto `RawOpportunity`. Not implemented for the MVP.
 */
export class LeverAdapter implements SourceAdapter {
  readonly id: string;

  constructor(private readonly company: string) {
    this.id = `lever:${company}`;
  }

  async fetch(): Promise<RawDataset> {
    throw new Error(`LeverAdapter(${this.company}) is not implemented in the MVP.`);
  }
}
