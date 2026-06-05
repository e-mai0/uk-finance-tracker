import type { RawDataset, SourceAdapter } from "../types";

/**
 * Stub for a future Greenhouse job-board adapter.
 *
 * Greenhouse exposes a public JSON board API per company
 * (`https://boards-api.greenhouse.io/v1/boards/{token}/jobs`). A real
 * implementation would fetch, filter to UK finance summer internships, and
 * map each posting onto `RawOpportunity`. Intentionally not implemented for
 * the MVP — it exists to prove the ingestion seam is pluggable.
 */
export class GreenhouseAdapter implements SourceAdapter {
  readonly id: string;

  constructor(private readonly boardToken: string) {
    this.id = `greenhouse:${boardToken}`;
  }

  async fetch(): Promise<RawDataset> {
    throw new Error(
      `GreenhouseAdapter(${this.boardToken}) is not implemented in the MVP.`,
    );
  }
}
