import type { RawDataset, SourceAdapter } from "../types";

/**
 * Stub for a future Workday adapter.
 *
 * Workday tenants expose a CXS JSON endpoint per career site
 * (`/wday/cxs/{tenant}/{site}/jobs`). Many large banks run Workday. A real
 * implementation would page through results, filter to UK finance summer
 * internships, and map onto `RawOpportunity`. Not implemented for the MVP.
 */
export class WorkdayAdapter implements SourceAdapter {
  readonly id: string;

  constructor(
    private readonly tenant: string,
    private readonly site: string,
  ) {
    this.id = `workday:${tenant}/${site}`;
  }

  async fetch(): Promise<RawDataset> {
    throw new Error(
      `WorkdayAdapter(${this.tenant}/${this.site}) is not implemented in the MVP.`,
    );
  }
}
