import { afterEach, describe, expect, it, vi } from "vitest";
import { mapWorkdayJobs, WorkdayAdapter } from "../ingestion/adapters/workday";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const ms: AdapterEmployer = { name: "Morgan Stanley", sector: "Investment Bank" };
const bx: AdapterEmployer = { name: "Blackstone", sector: "Private Equity" };

const PAGE = { total: 2, jobPostings: [
  { title: "2026 Summer Analyst Program", externalPath: "/job/London/Summer-Analyst_JR036591", locationsText: "London, United Kingdom", bulletFields: ["JR036591"] },
  { title: "2026 Summer Analyst Program", externalPath: "/job/NY/Summer-Analyst_JR036592", locationsText: "New York, United States", bulletFields: ["JR036592"] },
]};

describe("mapWorkdayJobs", () => {
  it("keeps UK rows, keys on the reqId, sets WORKDAY sourceType", () => {
    const out = mapWorkdayJobs(PAGE, "https://ms.wd5.myworkdayjobs.com", "External", ms);
    expect(out).toHaveLength(1);
    expect(out[0].sourceType).toBe("WORKDAY");
    expect(out[0].applicationUrl).toContain("JR036591");
  });
  it("throws on a bad payload", () => {
    expect(() => mapWorkdayJobs({}, "https://x", "y", ms)).toThrow(/jobPostings/);
  });

  // The Blackstone bug: a London "Summer Analyst" with NO "intern" substring is a
  // real early-careers role. classify gates it IN, so the mapper must keep it.
  it("ingests a London Summer Analyst that contains no 'intern' substring", () => {
    const page = { total: 1, jobPostings: [
      { title: "2027 Summer Analyst", externalPath: "/job/London/Summer-Analyst_JR99", locationsText: "London, United Kingdom" },
    ]};
    const out = mapWorkdayJobs(page, "https://bx.wd1.myworkdayjobs.com", "Blackstone_Campus_Careers", bx);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("2027 Summer Analyst");
    expect(out[0].title.toLowerCase()).not.toContain("intern");
    expect(out[0].programmeType).toBe("SUMMER_INTERNSHIP");
  });

  // Generality: other early-careers seasons without "intern" pass too.
  it("ingests an Off-Cycle Analyst (no 'intern' substring) and tags OFF_CYCLE", () => {
    const page = { total: 1, jobPostings: [
      { title: "Off-Cycle Analyst", externalPath: "/job/London/Off-Cycle_JR42", locationsText: "London, UK" },
    ]};
    const out = mapWorkdayJobs(page, "https://bx.wd1.myworkdayjobs.com", "Blackstone_Campus_Careers", bx);
    expect(out).toHaveLength(1);
    expect(out[0].programmeType).toBe("OFF_CYCLE");
  });

  // No over-inclusion: a senior/experienced role in the SAME payload is dropped
  // by classify (the sole gate), even when fetched by a broad query.
  it("excludes a senior/VP/experienced role in the same payload", () => {
    const page = { total: 3, jobPostings: [
      { title: "2027 Summer Analyst", externalPath: "/job/London/Summer_JR1", locationsText: "London, UK" },
      { title: "Vice President, Mergers & Acquisitions", externalPath: "/job/London/VP_JR2", locationsText: "London, UK" },
      { title: "Managing Director, Markets (Experienced Hire)", externalPath: "/job/London/MD_JR3", locationsText: "London, UK" },
    ]};
    const out = mapWorkdayJobs(page, "https://bx.wd1.myworkdayjobs.com", "Blackstone_Campus_Careers", bx);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("2027 Summer Analyst");
  });
});

// ---------------------------------------------------------------------------
// Fetch-breadth + bounded-pagination contract (the root-cause fix).
// We stub global.fetch, capture every request body, and feed back payloads.
// ---------------------------------------------------------------------------

function jsonRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("WorkdayAdapter.fetch — search breadth", () => {
  const cfg = { ats: "workday", host: "bx.wd1.myworkdayjobs.com", tenant: "bx", site: "Blackstone_Campus_Careers" } as const;

  it("does NOT filter the source to only the 'intern' substring", async () => {
    // BUG REPRODUCTION: the old body was {searchText:"intern"}, a server-side
    // full-text filter that drops "Summer Analyst" at the source. The fix must
    // broaden the query so non-"intern" early-careers roles are returned.
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      bodies.push(body);
      return jsonRes({ total: 0, jobPostings: [] });
    }));

    await new WorkdayAdapter(cfg, bx).fetch();

    const searchTexts = bodies.map((b) => String(b.searchText ?? ""));
    // It must never restrict the whole crawl to the single term "intern".
    expect(searchTexts).not.toEqual(["intern"]);
    // The breadth must come from the fetch query: either an empty search, or a
    // union of finance early-careers terms that includes a non-"intern" term.
    const broadensBeyondIntern =
      searchTexts.some((t) => t === "") ||
      searchTexts.some((t) => t !== "" && t !== "intern");
    expect(broadensBeyondIntern).toBe(true);
  });

  it("surfaces a Summer Analyst posting that 'intern' search would have hidden", async () => {
    // The server (modelled here) returns the Summer Analyst row ONLY for a query
    // that is not the literal "intern" filter — i.e. an empty search or a
    // broader early-careers term. If the adapter only ever asked for "intern",
    // it would receive nothing and the role would be dropped at the source.
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const q = String(body.searchText ?? "");
      if (q === "intern") return jsonRes({ total: 0, jobPostings: [] });
      return jsonRes({ total: 1, jobPostings: [
        { title: "2027 Summer Analyst", externalPath: "/job/London/Summer_JR777", locationsText: "London, United Kingdom" },
      ]});
    }));

    const ds = await new WorkdayAdapter(cfg, bx).fetch();
    const titles = ds.opportunities.map((o) => o.title);
    expect(titles).toContain("2027 Summer Analyst");
  });

  it("dedups a posting returned under more than one query term", async () => {
    // A term-union may surface the same posting under several terms; the adapter
    // must dedup by applicationUrl so a role is published once.
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const off = Number(body.offset ?? 0);
      if (off > 0) return jsonRes({ total: 1, jobPostings: [] });
      return jsonRes({ total: 1, jobPostings: [
        { title: "2027 Summer Analyst", externalPath: "/job/London/Summer_JRDUP", locationsText: "London, UK" },
      ]});
    }));

    const ds = await new WorkdayAdapter(cfg, bx).fetch();
    expect(ds.opportunities.filter((o) => o.title === "2027 Summer Analyst")).toHaveLength(1);
  });

  it("merges terms in a DETERMINISTIC order regardless of which term's fetch finishes first", async () => {
    // Each term returns one UNIQUE posting. The 'intern' term resolves SLOWEST so,
    // if order followed completion timing, its row would land last; the adapter must
    // instead order by EARLY_CAREERS_TERMS (intern first), proving order is keyed
    // off the term list, not fetch timing.
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const q = String(body.searchText ?? "");
      const off = Number(body.offset ?? 0);
      if (off > 0) return jsonRes({ total: 1, jobPostings: [] });
      if (q === "intern") await new Promise((r) => setTimeout(r, 25)); // slowest
      // Same classified title for every term (so classify treats them identically);
      // the term is encoded in the externalPath, which is what dedup keys on.
      return jsonRes({ total: 1, jobPostings: [
        { title: "2027 Summer Analyst", externalPath: `/job/London/Summer_${q}_JR`, locationsText: "London, UK" },
      ]});
    }));

    const ds = await new WorkdayAdapter(cfg, bx).fetch();
    const terms = ds.opportunities.map((o) => o.applicationUrl?.match(/Summer_(\w+?)_JR/)?.[1]);
    // intern term resolves last in wall-clock time but must appear FIRST (term order).
    expect(terms[0]).toBe("intern");
    expect(terms).toEqual(["intern", "analyst", "graduate", "summer", "placement", "insight"]);
  });

  it("ABORTS the whole adapter when one term's fetch fails (unchanged error semantics)", async () => {
    // The original serial loop threw on a non-ok response, aborting the run. The
    // parallel version (mapPool propagates rejections) must abort identically.
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const q = String(body.searchText ?? "");
      if (q === "graduate") return { ok: false, status: 503, statusText: "Unavailable", json: async () => ({}) } as unknown as Response;
      return jsonRes({ total: 0, jobPostings: [] });
    }));

    await expect(new WorkdayAdapter(cfg, bx).fetch()).rejects.toThrow(/503/);
  });

  it("stays bounded on a huge tenant (never pages past the offset<2000 cap per term)", async () => {
    // Morgan Stanley's `External` tenant carries thousands of postings. The crawl
    // must stop at the offset<2000 safety cap, regardless of how broad the query
    // is. We report a giant total and 20 rows per page forever; the adapter must
    // not loop unboundedly.
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      calls++;
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const off = Number(body.offset ?? 0);
      const jobs = Array.from({ length: 20 }, (_v, i) => ({
        title: `Role ${off + i}`, externalPath: `/job/x/${off + i}`, locationsText: "Tokyo, JP",
      }));
      return jsonRes({ total: 100000, jobPostings: jobs });
    }));

    await new WorkdayAdapter(cfg, bx).fetch();
    // offset<2000 @ 20/page = 100 pages per term. A short term-union (≤ ~6 terms)
    // keeps this well under ~700 requests; a single empty search is 100. Either
    // way it MUST be far below the unbounded 100000/20 = 5000 pages.
    expect(calls).toBeLessThanOrEqual(700);
    expect(calls).toBeGreaterThan(0);
  });
});
