import { afterEach, describe, expect, it, vi } from "vitest";
import { mapOracleList, OracleCloudAdapter } from "../ingestion/adapters/oracle-cloud";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const jpm: AdapterEmployer = { name: "J.P. Morgan", sector: "Investment Bank" };

const LIST = { items: [{ TotalJobsCount: 2, requisitionList: [
  { Id: "210693588", Title: "2026 Summer Analyst Programme", PrimaryLocation: "London, England, United Kingdom", PrimaryLocationCountry: "GB" },
  { Id: "210000001", Title: "2026 Summer Analyst Programme", PrimaryLocation: "New York, United States", PrimaryLocationCountry: "US" },
]}]};

describe("mapOracleList", () => {
  it("keeps only GB rows and carries the requisition Id + sourceType", () => {
    const out = mapOracleList(LIST, jpm);
    expect(out).toHaveLength(1);
    expect(out[0].sourceType).toBe("ORACLE_CLOUD");
    expect(out[0].applicationUrl).toContain("210693588");
    expect(out[0].location).toContain("London");
  });
  it("throws on an unexpected shape", () => {
    expect(() => mapOracleList({ nope: true }, jpm)).toThrow(/requisitionList/);
  });
});

// ---------------------------------------------------------------------------
// Detail-fetch parallelisation contract (bounded-concurrency refactor).
// The adapter pages the list, then fetches each row's detail page for the real
// deadline. We stub global.fetch to serve the list page and per-id detail pages,
// proving the parallel result equals the sequential expectation: same rows, a
// deterministic order, and each row's deadline applied to ITS OWN row.
// ---------------------------------------------------------------------------

function jsonRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

const oracleCfg = { ats: "oracle", host: "jpmc.fa.oraclecloud.com", site: "CX_1001" } as const;

// Three GB requisitions; each detail page carries a DISTINCT end date so a
// mis-aligned mapping (e.g. result applied to the wrong row) would be visible.
const MULTI_LIST = { items: [{ TotalJobsCount: 3, requisitionList: [
  { Id: "100", Title: "2026 Summer Analyst Programme", PrimaryLocation: "London, England, United Kingdom", PrimaryLocationCountry: "GB" },
  { Id: "200", Title: "2026 Summer Analyst Programme", PrimaryLocation: "London, England, United Kingdom", PrimaryLocationCountry: "GB" },
  { Id: "300", Title: "2026 Summer Analyst Programme", PrimaryLocation: "London, England, United Kingdom", PrimaryLocationCountry: "GB" },
]}]};

const DEADLINES: Record<string, string> = {
  "100": "2026-01-31",
  "200": "2026-02-28",
  "300": "2026-03-31",
};

describe("OracleCloudAdapter.fetch — bounded-concurrency detail fetches", () => {
  it("maps each row to its OWN deadline with a deterministic order, regardless of fetch completion order", async () => {
    // Detail fetches resolve in a SCRAMBLED order (later ids finish first) to
    // prove output order is keyed off the row list, not fetch timing.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("recruitingCEJobRequisitions?")) return jsonRes(MULTI_LIST);
      const m = url.match(/Id=%22(\d+)%22/);
      const id = m?.[1] ?? "";
      const delay = id === "300" ? 0 : id === "200" ? 10 : 20; // invert id order
      await new Promise((r) => setTimeout(r, delay));
      return jsonRes({ items: [{ ExternalPostedEndDate: DEADLINES[id] }] });
    }));

    const ds = await new OracleCloudAdapter(oracleCfg, jpm).fetch();
    const ids = ds.opportunities.map((o) => o.applicationUrl?.match(/job\/(\d+)$/)?.[1]);
    // Deterministic order == list order (100, 200, 300), not completion order.
    expect(ids).toEqual(["100", "200", "300"]);
    // Each row carries ITS OWN deadline (correct alignment).
    expect(ds.opportunities.map((o) => o.deadlineAt)).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31",
    ]);
    // applicationUrl/sourceUrl resolved from the oracle: placeholder to the human URL.
    expect(ds.opportunities.every((o) => o.applicationUrl?.startsWith("https://"))).toBe(true);
    expect(ds.opportunities.every((o) => o.sourceUrl === o.applicationUrl)).toBe(true);
  });

  it("ABORTS the whole adapter when one detail fetch fails (unchanged error semantics)", async () => {
    // The original serial loop did NOT wrap fetchOracleDeadline in try/catch, so a
    // single failing detail page propagated out of fetch() and aborted the run.
    // The parallel version (mapPool propagates rejections) must do the same.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("recruitingCEJobRequisitions?")) return jsonRes(MULTI_LIST);
      if (url.includes("Id=%22200%22")) return { ok: false, status: 500, statusText: "Server Error", json: async () => ({}) } as unknown as Response;
      return jsonRes({ items: [{ ExternalPostedEndDate: "2026-01-31" }] });
    }));

    await expect(new OracleCloudAdapter(oracleCfg, jpm).fetch()).rejects.toThrow(/500/);
  });
});
