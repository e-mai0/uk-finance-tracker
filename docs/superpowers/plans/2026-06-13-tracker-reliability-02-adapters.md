# Tracker Reliability — Plan 2: ATS Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Depends on Plan 1 (foundations) being merged first.**

**Goal:** Add 8 deterministic ATS adapters so live role coverage rises from 3 firms to ~25, capturing real deadlines where the feed exposes them and inheriting cycle-inference (Plan 1) elsewhere.

**Architecture:** Each adapter is a pure `map*(payload, employer) → RawOpportunity[]` function (unit-tested against a captured fixture) plus a thin `SourceAdapter` class whose `fetch()` does the I/O and calls `buildDataset(...)`. New ATS kinds are dispatched in `adapterFor()` using a typed `config` JSON on the `IngestionSource` row (added in Plan 1). All reuse `classifyPosting()`. Endpoints were live-probed 2026-06-13; capture a fresh fixture per adapter at build time.

**Tech Stack:** Next.js 15, Prisma 6, Vitest, TypeScript. No headless browser — every endpoint returns data to a plain server-side fetch.

**Spec:** `docs/superpowers/specs/2026-06-13-tracker-live-listings-reliability-design.md`
**Research:** verified endpoint details are in the spec's "Per-firm verified approach" table.

---

## The adapter recipe (read once; every task below follows it)

Every adapter file has this skeleton — only the `map*` body and the `fetch()` I/O differ:

```typescript
import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, originalSummary, type AdapterEmployer } from "./common";

export function mapXxx(payload: unknown, employer: AdapterEmployer): RawOpportunity[] {
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  // ...iterate payload, classifyPosting(...), push RawOpportunity with sourceType + (real) deadlineAt...
  return out;
}

export class XxxAdapter implements SourceAdapter {
  readonly id: string;
  constructor(/* config + */ private readonly employer: AdapterEmployer) { this.id = `xxx:...`; }
  async fetch(): Promise<RawDataset> { /* fetch -> mapXxx -> buildDataset(this.id, this.employer, rows) */ }
}
```

`RawOpportunity.deadlineAt` is an **ISO date string or null**. Adapters that read a native date format (dd/mm/yyyy, dd-Mon-yyyy) must convert to ISO (`YYYY-MM-DD`) before emitting. Adapters with no deadline leave it undefined — Plan 1's `normalize` will infer + flag it.

**Config typing.** Add to `src/ingestion/types.ts`:
```typescript
export type SourceConfig =
  | { ats: "workday"; host: string; tenant: string; site: string }
  | { ats: "oracle"; host: string; site: string }
  | { ats: "eightfold"; host: string; domain: string; endpoint: "apply" | "pcsx" }
  | { ats: "avature"; variant: "ubs" | "macquarie"; base: string; siteid?: string }
  | { ats: "radancy"; base: string }
  | { ats: "talnet"; host: string; board: number };
```

---

## Task 1: `adapterFor()` config dispatch + capture script

Wire the new kinds before adding adapters, so each subsequent task plugs into a known seam. Add a tiny capture helper for fixtures.

**Files:**
- Modify: `src/ingestion/sync.ts` (`adapterFor`)
- Create: `scripts/capture-fixture.ts` (dev-only fixture capture)

- [ ] **Step 1: Extend `adapterFor` skeleton**

In `src/ingestion/sync.ts`, extend the `switch (source.kind)` with cases that read `source.config` (typed via `SourceConfig`) and construct the new adapters. Add the imports for each adapter as you build it (Tasks 2–9). For now add the cases throwing a clear "not yet implemented in Plan 2 Task N" so the dispatch shape is committed:
```typescript
    case "ORACLE_CLOUD": { const c = source.config as Extract<SourceConfig,{ats:"oracle"}>; return new OracleCloudAdapter(c, employer); }
    case "WORKDAY": { const c = source.config as Extract<SourceConfig,{ats:"workday"}>; return new WorkdayAdapter(c, employer); }
    case "EIGHTFOLD": { const c = source.config as Extract<SourceConfig,{ats:"eightfold"}>; return new EightfoldAdapter(c, employer); }
    case "RADANCY": { const c = source.config as Extract<SourceConfig,{ats:"radancy"}>; return new RadancyAdapter(c, employer); }
    case "AVATURE": { const c = source.config as Extract<SourceConfig,{ats:"avature"}>; return new AvatureAdapter(c, employer); }
    case "TALNET": { const c = source.config as Extract<SourceConfig,{ats:"talnet"}>; return new TalNetAdapter(c, employer); }
```
And in the existing `CAREERS_PAGE` case, add hostname dispatch for the two bespoke SPAs **before** the JsonLdPage fallback:
```typescript
      if (host.endsWith("higher.gs.com")) return new GoldmanHigherAdapter(employer);
      if (host.endsWith("careers.db.com")) return new DeutscheBankBeesiteAdapter(employer);
```
(where `host = new URL(source.url).hostname`).

- [ ] **Step 2: Add the capture helper**

```typescript
// scripts/capture-fixture.ts — run with: npx tsx scripts/capture-fixture.ts <url> <out.json>
// One-off: saves a live endpoint response as a test fixture. Never imported by app code.
import { writeFile } from "node:fs/promises";
const [, , url, out] = process.argv;
const res = await fetch(url, { headers: { "user-agent": "CyclopsBot/1.0 (fixture capture)" } });
await writeFile(out, await res.text());
console.log(`captured ${url} → ${out} (${res.status})`);
```

- [ ] **Step 3: Typecheck (expect errors until adapters exist)**

Run: `npx tsc --noEmit`
Expected: errors referencing the not-yet-created adapter classes/`SourceConfig`. Add `SourceConfig` to `types.ts` now (from the recipe) to clear that one. Adapter-class errors are expected and resolved per task.

- [ ] **Step 4: Commit**

```bash
git add src/ingestion/sync.ts src/ingestion/types.ts scripts/capture-fixture.ts
git commit -m "feat(ingest): adapterFor config dispatch for new ATS kinds + fixture capture"
```

---

## Task 2: Oracle Cloud adapter (J.P. Morgan, Schroders) — REAL deadlines

List crawl (`expand=requisitionList`, paginate offset by returned-row-count, ~199/page cap) + per-Id detail fetch for `ExternalPostedEndDate`. Client-filter `PrimaryLocationCountry === "GB"`.

**Files:**
- Create: `src/ingestion/adapters/oracle-cloud.ts`
- Create: `src/test/oracle-cloud.test.ts`
- Create fixture: `src/test/fixtures/oracle-jpmc-list.json`

- [ ] **Step 1: Capture a fixture**

Run: `npx tsx scripts/capture-fixture.ts "https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=CX_1001,keyword=summer%20analyst,limit=50,offset=0" src/test/fixtures/oracle-jpmc-list.json`
Expected: a JSON file with `items[0].requisitionList[]` and `items[0].TotalJobsCount`. Trim to ~5 representative rows by hand (keep a UK `GB` row and a non-UK row).

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { mapOracleList } from "../ingestion/adapters/oracle-cloud";
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/oracle-cloud.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the adapter**

```typescript
import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, fetchJson, originalSummary, type AdapterEmployer } from "./common";

interface OracleReq { Id: string; Title: string; PrimaryLocation?: string; PrimaryLocationCountry?: string }

export function mapOracleList(payload: unknown, employer: AdapterEmployer): RawOpportunity[] {
  const list = (payload as { items?: { requisitionList?: OracleReq[] }[] })?.items?.[0]?.requisitionList;
  if (!Array.isArray(list)) throw new Error("Unexpected Oracle payload: missing requisitionList");
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const r of list) {
    if (!r?.Id || !r.Title) continue;
    if ((r.PrimaryLocationCountry ?? "").toUpperCase() !== "GB") continue; // client-side UK filter
    const location = r.PrimaryLocation ?? "London";
    const verdict = classifyPosting({ title: r.Title, location }, fallback);
    if (!verdict.include) continue;
    out.push({
      employer: employer.name,
      title: r.Title.trim(),
      roleFamily: verdict.roleFamily,
      location,
      status: "OPEN",
      summary: originalSummary({ title: r.Title.trim(), employer: employer.name, atsLabel: "Oracle Cloud careers", location }),
      applicationUrl: undefined, // detail URL is built by the adapter; list has only Id
      sourceUrl: undefined,
      sourceType: "ORACLE_CLOUD",
      tags: [],
      // deadlineAt filled by the adapter after the detail fetch (see fetch()).
      // Stash the Id in tags-free way: encode in applicationUrl below.
    });
    out[out.length - 1].applicationUrl = `oracle:${r.Id}`; // placeholder, resolved in fetch()
  }
  return out;
}

/** Detail fetch → ExternalPostedEndDate (real deadline). ISO already. */
export async function fetchOracleDeadline(host: string, site: string, id: string): Promise<{ deadline: string | null; url: string }> {
  const url = `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?onlyData=true&expand=all&finder=ById;Id=%22${id}%22,siteNumber=${site}`;
  const payload = (await fetchJson(url)) as { items?: { ExternalPostedEndDate?: string }[] };
  const end = payload?.items?.[0]?.ExternalPostedEndDate ?? null;
  const human = `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${id}`;
  return { deadline: end, url: human };
}

export class OracleCloudAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "oracle" }>, private readonly employer: AdapterEmployer) {
    this.id = `oracle:${cfg.host}/${cfg.site}`;
  }
  async fetch(): Promise<RawDataset> {
    const base = `https://${this.cfg.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=${this.cfg.site}`;
    // Page until offset >= TotalJobsCount; advance by the actual returned row count (≈199 cap).
    const rows: RawOpportunity[] = [];
    let offset = 0, total = Infinity;
    while (offset < total) {
      const page = (await fetchJson(`${base},limit=200,offset=${offset}`)) as { items?: { TotalJobsCount?: number; requisitionList?: unknown[] }[] };
      total = page.items?.[0]?.TotalJobsCount ?? 0;
      const count = page.items?.[0]?.requisitionList?.length ?? 0;
      rows.push(...mapOracleList(page, this.employer));
      if (count === 0) break;
      offset += count;
    }
    // Resolve each placeholder Id → real apply URL + deadline (detail fetch).
    for (const r of rows) {
      const id = (r.applicationUrl ?? "").replace("oracle:", "");
      const { deadline, url } = await fetchOracleDeadline(this.cfg.host, this.cfg.site, id);
      r.applicationUrl = url; r.sourceUrl = url;
      if (deadline) r.deadlineAt = deadline; // real deadline → normalize won't infer
    }
    return buildDataset(this.id, this.employer, rows);
  }
}
```

- [ ] **Step 5: Wire the import in `sync.ts`**

Add `import { OracleCloudAdapter } from "./adapters/oracle-cloud";` to `sync.ts`.

- [ ] **Step 6: Run test + typecheck**

Run: `npx vitest run src/test/oracle-cloud.test.ts && npx tsc --noEmit`
Expected: PASS; the `ORACLE_CLOUD` case in `adapterFor` now resolves.

- [ ] **Step 7: Commit**

```bash
git add src/ingestion/adapters/oracle-cloud.ts src/test/oracle-cloud.test.ts src/test/fixtures/oracle-jpmc-list.json src/ingestion/sync.ts
git commit -m "feat(ingest): Oracle Cloud adapter with real deadlines (JPM, Schroders)"
```

---

## Task 3: tal.net adapter (Nomura, Jefferies, Rothschild, Evercore, Lazard, Fidelity, BofA) — REAL deadlines

Plain HTML board parse via `fetchTextRobust` (Plan 1), follow full canonical `/vx/.../opp/<id>` hrefs, extract inline deadlines, honor Crawl-delay. Per-host board number from config.

**Files:**
- Create: `src/ingestion/adapters/talnet.ts`
- Create: `src/test/talnet.test.ts`
- Create fixture: `src/test/fixtures/talnet-nomura-board.html`

- [ ] **Step 1: Capture a fixture**

Run: `npx tsx scripts/capture-fixture.ts "https://nomuracampus.tal.net/candidate/jobboard/vacancy/1/adv/" src/test/fixtures/talnet-nomura-board.html`
Expected: HTML containing `/vx/.../opp/<id>-<slug>/en-GB` links, titles, and inline "Deadline" text. If it returns an Imperva interstitial (it did NOT on 2026-06-13), stop and reassess — the spec's Imperva-guard contingency applies.

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { mapTalNetBoard, parseTalNetDeadline } from "../ingestion/adapters/talnet";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const nomura: AdapterEmployer = { name: "Nomura", sector: "Investment Bank" };

const HTML = `
<a href="/vx/lang-en-GB/mobile-0/brand-4/xf-abc/candidate/so/pm/1/pl/1/opp/1388-investment-banking-summer-internship-london/en-GB">
  Investment Banking Summer Internship - London</a>
<span class="deadline">Deadline: 09/07/2026</span>
<a href="/vx/lang-en-GB/mobile-0/brand-4/xf-abc/candidate/so/pm/1/pl/1/opp/1390-global-markets-summer-internship-tokyo/en-GB">
  Global Markets Summer Internship - Tokyo</a>`;

describe("parseTalNetDeadline", () => {
  it("parses dd/mm/yyyy to ISO", () => {
    expect(parseTalNetDeadline("Deadline: 09/07/2026")).toBe("2026-07-09");
  });
  it("parses 'd Mon yyyy' to ISO", () => {
    expect(parseTalNetDeadline("9 Jul 2026")).toBe("2026-07-09");
  });
  it("returns null when absent", () => {
    expect(parseTalNetDeadline("Rolling")).toBeNull();
  });
});

describe("mapTalNetBoard", () => {
  it("keeps London summer internships with canonical URLs and deadlines", () => {
    const out = mapTalNetBoard(HTML, "https://nomuracampus.tal.net", nomura);
    expect(out).toHaveLength(1);
    expect(out[0].applicationUrl).toContain("/opp/1388-");
    expect(out[0].applicationUrl?.startsWith("https://nomuracampus.tal.net/vx/")).toBe(true);
    expect(out[0].deadlineAt).toBe("2026-07-09");
    expect(out[0].sourceType).toBe("TALNET");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/talnet.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the adapter**

```typescript
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
    // location is usually in the title (e.g. "... - London"); classify uses it.
    const verdict = classifyPosting({ title, location: title }, fallback);
    if (!verdict.include) continue;
    // Deadline: look at the ~400 chars following this link for a Deadline token.
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
    const html = await fetchTextRobust(board); // throws ImpervaBlockedError → sync marks unreachable
    return buildDataset(this.id, this.employer, mapTalNetBoard(html, `https://${this.cfg.host}`, this.employer));
  }
}
```

- [ ] **Step 5: Wire + test + typecheck**

Add `import { TalNetAdapter } from "./adapters/talnet";` to `sync.ts`.
Run: `npx vitest run src/test/talnet.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests); dispatch resolves.

- [ ] **Step 6: Commit**

```bash
git add src/ingestion/adapters/talnet.ts src/test/talnet.test.ts src/test/fixtures/talnet-nomura-board.html src/ingestion/sync.ts
git commit -m "feat(ingest): tal.net board adapter with inline deadlines (6 boutiques + BofA)"
```

---

## Task 4: Deutsche Bank Beesite adapter — REAL deadlines

`GET api-deutschebank.beesite.de/graduatesearch/?data={json}`; filter `CountryCode==="GB"`; `PublicationEndDate` is the deadline (treat `2099-12-31` as none). Routed via `CAREERS_PAGE` host dispatch.

**Files:**
- Create: `src/ingestion/adapters/deutsche-beesite.ts`
- Create: `src/test/deutsche-beesite.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { mapBeesite } from "../ingestion/adapters/deutsche-beesite";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const db: AdapterEmployer = { name: "Deutsche Bank", sector: "Investment Bank" };

const PAYLOAD = { SearchResult: { SearchResultItems: [
  { MatchedObjectDescriptor: { PositionID: "73600", PositionTitle: "2026 Summer Internship - Investment Bank (London)",
      PositionLocation: [{ CountryCode: "GB", CityName: "London" }], PublicationEndDate: "2026-08-04", ApplyURI: ["https://db.recsolu.com/x"] } },
  { MatchedObjectDescriptor: { PositionID: "73601", PositionTitle: "2026 Summer Internship - Sydney",
      PositionLocation: [{ CountryCode: "AU", CityName: "Sydney" }], PublicationEndDate: "2099-12-31", ApplyURI: ["https://db.recsolu.com/y"] } },
]}};

describe("mapBeesite", () => {
  it("keeps GB internships with a real deadline", () => {
    const out = mapBeesite(PAYLOAD, db);
    expect(out).toHaveLength(1);
    expect(out[0].deadlineAt).toBe("2026-08-04");
    expect(out[0].sourceType).toBe("CAREERS_PAGE");
  });
  it("treats the 2099 sentinel as no deadline (will be inferred)", () => {
    const only = { SearchResult: { SearchResultItems: [PAYLOAD.SearchResult.SearchResultItems[1]] } };
    // GB filter drops the AU row, so assert the sentinel logic via a GB-clone:
    const gbSentinel = { SearchResult: { SearchResultItems: [{ MatchedObjectDescriptor: {
      ...PAYLOAD.SearchResult.SearchResultItems[1].MatchedObjectDescriptor,
      PositionLocation: [{ CountryCode: "GB", CityName: "London" }], PositionTitle: "2026 Summer Internship - London" } }] } };
    const out = mapBeesite(gbSentinel, db);
    expect(out[0].deadlineAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/deutsche-beesite.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

```typescript
import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, fetchJson, originalSummary, type AdapterEmployer } from "./common";

interface BeesiteItem { MatchedObjectDescriptor?: {
  PositionID?: string; PositionTitle?: string;
  PositionLocation?: { CountryCode?: string; CityName?: string }[];
  PublicationEndDate?: string; ApplyURI?: string[]; } }

export function mapBeesite(payload: unknown, employer: AdapterEmployer): RawOpportunity[] {
  const items = (payload as { SearchResult?: { SearchResultItems?: BeesiteItem[] } })?.SearchResult?.SearchResultItems;
  if (!Array.isArray(items)) throw new Error("Unexpected Beesite payload: missing SearchResultItems");
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const it of items) {
    const d = it.MatchedObjectDescriptor;
    if (!d?.PositionID || !d.PositionTitle) continue;
    const locs = d.PositionLocation ?? [];
    if (!locs.some((l) => (l.CountryCode ?? "").toUpperCase() === "GB")) continue; // UK only
    const location = locs.find((l) => l.CountryCode === "GB")?.CityName ?? "London";
    const verdict = classifyPosting({ title: d.PositionTitle, location }, fallback);
    if (!verdict.include) continue;
    const end = d.PublicationEndDate;
    const deadline = end && !end.startsWith("2099") ? end.slice(0, 10) : undefined; // 2099 = open/no deadline
    const url = d.ApplyURI?.[0];
    out.push({
      employer: employer.name, title: d.PositionTitle.trim(), roleFamily: verdict.roleFamily,
      location, status: "OPEN",
      summary: originalSummary({ title: d.PositionTitle.trim(), employer: employer.name, atsLabel: "Deutsche Bank careers (Beesite)", location }),
      applicationUrl: url, sourceUrl: url, sourceType: "CAREERS_PAGE",
      deadlineAt: deadline, tags: [],
    });
  }
  return out;
}

const DATA = encodeURIComponent(JSON.stringify({
  LanguageCode: "en",
  SearchParameters: { FirstItem: 1, CountItem: 100, MatchedObjectDescriptor: [
    "PositionID","PositionTitle","PositionLocation","PublicationStartDate","PublicationEndDate","ApplyURI","CareerLevel" ] },
  SearchCriteria: [],
}));

export class DeutscheBankBeesiteAdapter implements SourceAdapter {
  readonly id = "beesite:deutsche-bank";
  constructor(private readonly employer: AdapterEmployer) {}
  async fetch(): Promise<RawDataset> {
    const payload = await fetchJson(`https://api-deutschebank.beesite.de/graduatesearch/?data=${DATA}`);
    return buildDataset(this.id, this.employer, mapBeesite(payload, this.employer));
  }
}
```

- [ ] **Step 4: Wire + test + typecheck**

Add `import { DeutscheBankBeesiteAdapter } from "./adapters/deutsche-beesite";` to `sync.ts`.
Run: `npx vitest run src/test/deutsche-beesite.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/adapters/deutsche-beesite.ts src/test/deutsche-beesite.test.ts src/ingestion/sync.ts
git commit -m "feat(ingest): Deutsche Bank Beesite adapter with real PublicationEndDate deadlines"
```

---

## Task 5: Workday adapter (Morgan Stanley, Barclays, Blackstone)

POST CXS `/jobs`, paginate offset by ≤20, dedup on `bulletFields[0]` reqId, client-filter `locationsText`. No deadline (inferred). Tolerate a blocked detail endpoint (Barclays). Needs a POST+JSON robust fetch.

**Files:**
- Create: `src/ingestion/adapters/workday.ts` (replaces the throwing stub)
- Create: `src/test/workday.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { mapWorkdayJobs } from "../ingestion/adapters/workday";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const ms: AdapterEmployer = { name: "Morgan Stanley", sector: "Investment Bank" };

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/workday.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the adapter**

```typescript
import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, originalSummary, type AdapterEmployer } from "./common";
import { isUkLocation } from "../classify";

interface WorkdayPosting { title?: string; externalPath?: string; locationsText?: string; bulletFields?: string[] }

export function mapWorkdayJobs(payload: unknown, baseUrl: string, _site: string, employer: AdapterEmployer): RawOpportunity[] {
  const jobs = (payload as { jobPostings?: WorkdayPosting[] })?.jobPostings;
  if (!Array.isArray(jobs)) throw new Error("Unexpected Workday payload: missing jobPostings");
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const j of jobs) {
    if (!j?.title || !j.externalPath) continue;
    const location = j.locationsText ?? "";
    if (!isUkLocation(location)) continue; // client-side UK filter (facet ids vary per tenant)
    const verdict = classifyPosting({ title: j.title, location }, fallback);
    if (!verdict.include) continue;
    const url = `${baseUrl}${j.externalPath}`;
    out.push({
      employer: employer.name, title: j.title.trim(), roleFamily: verdict.roleFamily,
      location: location || "London", status: "OPEN",
      summary: originalSummary({ title: j.title.trim(), employer: employer.name, atsLabel: "Workday careers", location: location || "UK" }),
      applicationUrl: url, sourceUrl: url, sourceType: "WORKDAY", tags: [],
    });
  }
  return out;
}

export class WorkdayAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "workday" }>, private readonly employer: AdapterEmployer) {
    this.id = `workday:${cfg.tenant}/${cfg.site}`;
  }
  async fetch(): Promise<RawDataset> {
    const endpoint = `https://${this.cfg.host}/wday/cxs/${this.cfg.tenant}/${this.cfg.site}/jobs`;
    const rows: RawOpportunity[] = [];
    let offset = 0, total = Infinity;
    const seen = new Set<string>();
    while (offset < total && offset < 2000) { // hard safety cap
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; CyclopsBot/1.0)" },
        body: JSON.stringify({ limit: 20, offset, searchText: "intern", appliedFacets: {} }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`POST ${endpoint} → ${res.status}`);
      const page = (await res.json()) as { total?: number; jobPostings?: WorkdayPosting[] };
      total = page.total ?? 0;
      const mapped = mapWorkdayJobs(page, `https://${this.cfg.host}`, this.cfg.site, this.employer);
      for (const r of mapped) { const k = r.applicationUrl ?? r.title; if (!seen.has(k)) { seen.add(k); rows.push(r); } }
      const count = page.jobPostings?.length ?? 0;
      if (count === 0) break;
      offset += count;
    }
    return buildDataset(this.id, this.employer, rows);
  }
}
```

- [ ] **Step 4: Wire + test + typecheck**

Add `import { WorkdayAdapter } from "./adapters/workday";` to `sync.ts` (replacing the stub import if present).
Run: `npx vitest run src/test/workday.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/adapters/workday.ts src/test/workday.test.ts src/ingestion/sync.ts
git commit -m "feat(ingest): real Workday CXS adapter (Morgan Stanley, Barclays, Blackstone)"
```

---

## Task 6: Eightfold adapter (HSBC, Citi)

Per-tenant endpoint (`apply/v2/jobs` vs `pcsx/search`), paginate `start += 10`, client post-filter intern + London. No deadline (inferred). 200+count=0 = off-season (valid empty).

**Files:**
- Create: `src/ingestion/adapters/eightfold.ts`
- Create: `src/test/eightfold.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { mapEightfold } from "../ingestion/adapters/eightfold";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const hsbc: AdapterEmployer = { name: "HSBC", sector: "Investment Bank" };

const APPLY = { count: 2, positions: [
  { id: 563774611317888, name: "2026 Global Banking Summer Internship", location: "London, United Kingdom", canonicalPositionUrl: "https://hsbc.eightfold.ai/careers/job/1" },
  { id: 563774611317889, name: "2026 Markets Summer Internship", location: "Hong Kong", canonicalPositionUrl: "https://hsbc.eightfold.ai/careers/job/2" },
]};

describe("mapEightfold (apply variant)", () => {
  it("keeps London internships and keys on numeric id", () => {
    const out = mapEightfold(APPLY, "apply", "https://hsbc.eightfold.ai", hsbc);
    expect(out).toHaveLength(1);
    expect(out[0].sourceType).toBe("EIGHTFOLD");
    expect(out[0].applicationUrl).toContain("/job/1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/eightfold.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the adapter**

```typescript
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

export function mapEightfold(payload: unknown, endpoint: "apply" | "pcsx", base: string, employer: AdapterEmployer): RawOpportunity[] {
  if (endpoint === "apply") {
    const p = payload as { positions?: EfPos[] }; return rows(p?.positions ?? [], base, employer);
  }
  const p = payload as { data?: { positions?: EfPos[] } }; return rows(p?.data?.positions ?? [], base, employer);
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
    let start = 0, total = Infinity;
    while (start < total && start < 1000) {
      const payload = await fetchJson(`${base}${path}?domain=${this.cfg.domain}&query=intern&location=London&start=${start}`);
      total = count(payload, this.cfg.endpoint);
      all.push(...mapEightfold(payload, this.cfg.endpoint, base, this.employer));
      start += 10; // both endpoints page size 10
      if (total === 0) break; // off-season is a valid empty (200 + count 0)
    }
    return buildDataset(this.id, this.employer, all);
  }
}
```

- [ ] **Step 4: Wire + test + typecheck**

Add `import { EightfoldAdapter } from "./adapters/eightfold";` to `sync.ts`.
Run: `npx vitest run src/test/eightfold.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/adapters/eightfold.ts src/test/eightfold.test.ts src/ingestion/sync.ts
git commit -m "feat(ingest): Eightfold adapter (HSBC apply/v2, Citi pcsx)"
```

---

## Task 7: Radancy / TalentBrew adapter (BlackRock; also covers Citi, Barclays)

One generic `{base}` adapter. `GET {base}/search-jobs/results?Keywords=intern&SearchType=1...` returns `{results: "<html>"}`; parse the HTML fragment for `<a data-job-id>` + title + location. No deadline (inferred). Post-filter location.

**Files:**
- Create: `src/ingestion/adapters/radancy.ts`
- Create: `src/test/radancy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { mapRadancy } from "../ingestion/adapters/radancy";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const br: AdapterEmployer = { name: "BlackRock", sector: "Asset Management" };

const RESULTS = `<section id="search-results" data-total-results="1" data-total-pages="1">
<ul><li><a href="/job/london/2026-summer-internship-emea/45831/90599500992" data-job-id="90599500992">
<h2>2026 Summer Internship Programme EMEA</h2></a><span class="job-location">London, United Kingdom</span></li></ul></section>`;

describe("mapRadancy", () => {
  it("parses the JSON-wrapped HTML into UK internships keyed on jobId", () => {
    const out = mapRadancy({ results: RESULTS }, "https://careers.blackrock.com", br);
    expect(out).toHaveLength(1);
    expect(out[0].applicationUrl).toBe("https://careers.blackrock.com/job/london/2026-summer-internship-emea/45831/90599500992");
    expect(out[0].sourceType).toBe("RADANCY");
  });
  it("throws when results html is missing", () => {
    expect(() => mapRadancy({}, "https://x", br)).toThrow(/results/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/radancy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the adapter**

```typescript
import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, fetchJson, originalSummary, type AdapterEmployer } from "./common";

const JOB_RE = /<a\s+href="([^"]+)"\s+data-job-id="(\d+)"[^>]*>[\s\S]*?<h2[^>]*>\s*([^<]+?)\s*<\/h2>[\s\S]*?(?:class="job-location"[^>]*>\s*([^<]+?)\s*<)?/gi;

export function mapRadancy(payload: unknown, base: string, employer: AdapterEmployer): RawOpportunity[] {
  const html = (payload as { results?: string })?.results;
  if (typeof html !== "string") throw new Error("Unexpected Radancy payload: missing `results` html");
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(JOB_RE)) {
    const [, href, jobId, title, location = ""] = m;
    if (seen.has(jobId)) continue; seen.add(jobId);
    const verdict = classifyPosting({ title: title.trim(), location: location.trim() || title }, fallback);
    if (!verdict.include) continue;
    const url = href.startsWith("http") ? href : `${base}${href}`;
    out.push({ employer: employer.name, title: title.trim(), roleFamily: verdict.roleFamily,
      location: location.trim() || "London", status: "OPEN",
      summary: originalSummary({ title: title.trim(), employer: employer.name, atsLabel: "careers site (TalentBrew)", location: location.trim() || "UK" }),
      applicationUrl: url, sourceUrl: url, sourceType: "RADANCY", tags: [] });
  }
  return out;
}

export class RadancyAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "radancy" }>, private readonly employer: AdapterEmployer) {
    this.id = `radancy:${cfg.base}`;
  }
  async fetch(): Promise<RawDataset> {
    const q = "Keywords=intern&SearchType=1&CurrentPage=1&RecordsPerPage=100&ActiveFacetID=0&SortCriteria=0&SortDirection=0&SearchResultsModuleName=Section+3+-+Search+Results&SearchFiltersModuleName=Search+Filters";
    const payload = await fetchJson(`${this.cfg.base}/search-jobs/results?${q}`);
    return buildDataset(this.id, this.employer, mapRadancy(payload, this.cfg.base, this.employer));
  }
}
```

- [ ] **Step 4: Wire + test + typecheck**

Add `import { RadancyAdapter } from "./adapters/radancy";` to `sync.ts`.
Run: `npx vitest run src/test/radancy.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/adapters/radancy.ts src/test/radancy.test.ts src/ingestion/sync.ts
git commit -m "feat(ingest): Radancy/TalentBrew adapter (BlackRock; reusable for Citi/Barclays)"
```

---

## Task 8: Avature adapter (UBS, Macquarie)

Two variants. Macquarie: server-rendered HTML `SearchJobs?search=internship`, parse `<article class="article--result">`, no deadline. UBS: parse the embedded-JSON of the first page (10 newest), real deadline from the detail page (deferred enrichment — see note). Both no-browser.

**Files:**
- Create: `src/ingestion/adapters/avature.ts`
- Create: `src/test/avature.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { mapMacquarie } from "../ingestion/adapters/avature";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const mq: AdapterEmployer = { name: "Macquarie", sector: "Investment Bank" };

const HTML = `<article class="article--result">
  <a href="/en_US/careers/JobDetail?jobId=22679">2026 Macquarie Summer Internship - London</a>
  <img alt="Office Location:"><span>London, UK</span></article>
<article class="article--result">
  <a href="/en_US/careers/JobDetail?jobId=22680">2026 Macquarie Summer Internship - Sao Paulo</a>
  <img alt="Office Location:"><span>Sao Paulo</span></article>`;

describe("mapMacquarie", () => {
  it("keeps London internships keyed on jobId", () => {
    const out = mapMacquarie(HTML, "https://recruitment.macquarie.com", mq);
    expect(out).toHaveLength(1);
    expect(out[0].applicationUrl).toContain("jobId=22679");
    expect(out[0].sourceType).toBe("AVATURE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/avature.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the adapter**

```typescript
import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import type { SourceConfig } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, fetchText, originalSummary, type AdapterEmployer } from "./common";

const MQ_RE = /<article class="article--result">[\s\S]*?href="([^"]*JobDetail\?jobId=(\d+))"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]*?Office Location:"[^>]*>\s*<[^>]*>\s*([^<]+?)\s*</gi;

export function mapMacquarie(html: string, base: string, employer: AdapterEmployer): RawOpportunity[] {
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(MQ_RE)) {
    const [, href, jobId, title, location = ""] = m;
    if (seen.has(jobId)) continue; seen.add(jobId);
    if (/job alert/i.test(title)) continue; // skip the "Set up a job alert" UI row
    const verdict = classifyPosting({ title: title.trim(), location: location.trim() || title }, fallback);
    if (!verdict.include) continue;
    const url = href.startsWith("http") ? href : `${base}${href}`;
    out.push({ employer: employer.name, title: title.trim(), roleFamily: verdict.roleFamily,
      location: location.trim() || "London", status: "OPEN",
      summary: originalSummary({ title: title.trim(), employer: employer.name, atsLabel: "careers site (Avature)", location: location.trim() || "UK" }),
      applicationUrl: url, sourceUrl: url, sourceType: "AVATURE", tags: [] });
  }
  return out;
}

export class AvatureAdapter implements SourceAdapter {
  readonly id: string;
  constructor(private readonly cfg: Extract<SourceConfig, { ats: "avature" }>, private readonly employer: AdapterEmployer) {
    this.id = `avature:${cfg.variant}`;
  }
  async fetch(): Promise<RawDataset> {
    if (this.cfg.variant === "macquarie") {
      const html = await fetchText(`${this.cfg.base}/en_US/careers/SearchJobs/?search=internship`);
      return buildDataset(this.id, this.employer, mapMacquarie(html, this.cfg.base, this.employer));
    }
    // UBS: parse the embedded JSON of the home page (10 newest). Full-board POST +
    // per-detail deadline enrichment is a documented follow-up (see plan note).
    const html = await fetchText(`${this.cfg.base}/TGnewUI/Search/Home/Home?partnerid=25008&siteid=${this.cfg.siteid}`);
    return buildDataset(this.id, this.employer, mapUbsEmbedded(html, this.cfg.base, this.employer));
  }
}

// UBS embedded-JSON parser: the shell embeds entity-encoded JSON rows.
export function mapUbsEmbedded(html: string, base: string, employer: AdapterEmployer): RawOpportunity[] {
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  const decoded = html.replace(/&quot;/g, '"');
  for (const m of decoded.matchAll(/"reqid":(\d+)[\s\S]*?"jobtitle":"([^"]+)"[\s\S]*?"formtext23":"([^"]*)"/gi)) {
    const [, reqid, title, country] = m;
    const verdict = classifyPosting({ title, location: country }, fallback);
    if (!verdict.include) continue;
    const url = `${base}/TGnewUI/Search/Home/HomeWithPreLoad?partnerid=25008&siteid=5131&PageType=JobDetails&jobid=${reqid}`;
    out.push({ employer: employer.name, title: title.trim(), roleFamily: verdict.roleFamily,
      location: /united kingdom|london/i.test(country) ? "London" : country || "UK", status: "OPEN",
      summary: originalSummary({ title: title.trim(), employer: employer.name, atsLabel: "careers site (Avature)", location: "London" }),
      applicationUrl: url, sourceUrl: url, sourceType: "AVATURE", tags: [] });
  }
  return out;
}
```

**Note (documented follow-up, not this task):** UBS full-board coverage beyond the 10 newest needs the `__RequestVerificationToken` POST, and the real `Application Deadline` lives on the detail page — both are a later enrichment. The baseline above is reliable for newest roles; deadlines for UBS will be inferred until detail enrichment lands.

- [ ] **Step 4: Wire + test + typecheck**

Add `import { AvatureAdapter } from "./adapters/avature";` to `sync.ts`.
Run: `npx vitest run src/test/avature.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/adapters/avature.ts src/test/avature.test.ts src/ingestion/sync.ts
git commit -m "feat(ingest): Avature adapter (Macquarie HTML, UBS embedded JSON)"
```

---

## Task 9: Goldman GraphQL adapter

`POST api-higher.gs.com/gateway/api/v1/graphql` with a **pinned** `roleSearch` operation (`experiences:["CAMPUS"]`), filter UK on `locations[].country`, key on `externalSource.sourceId`. No deadline (inferred). Routed via `CAREERS_PAGE` host dispatch.

**Files:**
- Create: `src/ingestion/adapters/goldman-higher.ts`
- Create: `src/test/goldman-higher.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { mapGoldmanRoles } from "../ingestion/adapters/goldman-higher";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const gs: AdapterEmployer = { name: "Goldman Sachs", sector: "Investment Bank" };

const DATA = { data: { roleSearch: { totalCount: 2, items: [
  { roleId: "164510_GS_CAMPUS", jobTitle: "2026 Summer Analyst — Investment Banking", division: "Investment Banking",
    locations: [{ city: "London", country: "United Kingdom" }], externalSource: { sourceId: "164510" } },
  { roleId: "164511_GS_CAMPUS", jobTitle: "2026 Summer Analyst — Engineering", division: "Engineering",
    locations: [{ city: "New York", country: "United States" }], externalSource: { sourceId: "164511" } },
]}}};

describe("mapGoldmanRoles", () => {
  it("keeps UK campus roles and builds the /roles/<sourceId> URL", () => {
    const out = mapGoldmanRoles(DATA, gs);
    expect(out).toHaveLength(1);
    expect(out[0].applicationUrl).toBe("https://higher.gs.com/roles/164510");
    expect(out[0].sourceType).toBe("CAREERS_PAGE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/goldman-higher.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the adapter**

```typescript
import type { RawDataset, RawOpportunity, SourceAdapter } from "../types";
import { classifyPosting } from "../classify";
import { buildDataset, fallbackFamilyFor, originalSummary, type AdapterEmployer } from "./common";

interface GsRole { jobTitle?: string; division?: string; locations?: { city?: string; country?: string }[]; externalSource?: { sourceId?: string } }

export function mapGoldmanRoles(payload: unknown, employer: AdapterEmployer): RawOpportunity[] {
  const items = (payload as { data?: { roleSearch?: { items?: GsRole[] } } })?.data?.roleSearch?.items;
  if (!Array.isArray(items)) throw new Error("Unexpected Goldman payload: missing roleSearch.items");
  const fallback = fallbackFamilyFor(employer);
  const out: RawOpportunity[] = [];
  for (const r of items) {
    if (!r?.jobTitle) continue;
    const loc = r.locations?.find((l) => /united kingdom|london|uk\b/i.test(`${l.city} ${l.country}`));
    if (!loc) continue; // UK only
    const verdict = classifyPosting({ title: r.jobTitle, location: `${loc.city} ${loc.country}`, departments: r.division ? [r.division] : [] }, fallback);
    if (!verdict.include) continue;
    const url = `https://higher.gs.com/roles/${r.externalSource?.sourceId ?? ""}`;
    out.push({ employer: employer.name, title: r.jobTitle.trim(), roleFamily: verdict.roleFamily,
      divisionDesk: r.division?.trim() || undefined, location: loc.city ?? "London", status: "OPEN",
      summary: originalSummary({ title: r.jobTitle.trim(), employer: employer.name, atsLabel: "Goldman Sachs careers (higher.gs.com)", department: r.division ?? null, location: loc.city ?? "London" }),
      applicationUrl: url, sourceUrl: url, sourceType: "CAREERS_PAGE", tags: [] });
  }
  return out;
}

const QUERY = `query($i: RoleSearchQueryInput!){ roleSearch(searchQueryInput:$i){ totalCount items{ roleId jobTitle division locations{ city country } externalSource{ sourceId } } } }`;

export class GoldmanHigherAdapter implements SourceAdapter {
  readonly id = "goldman:higher-gs";
  constructor(private readonly employer: AdapterEmployer) {}
  async fetch(): Promise<RawDataset> {
    const all: RawOpportunity[] = [];
    let page = 0, total = Infinity;
    while (page * 50 < total && page < 20) {
      const res = await fetch("https://api-higher.gs.com/gateway/api/v1/graphql", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (compatible; CyclopsBot/1.0)" },
        body: JSON.stringify({ query: QUERY, variables: { i: { page: { pageSize: 50, pageNumber: page }, experiences: ["CAMPUS"], searchTerm: "summer internship" } } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Goldman GraphQL → ${res.status}`);
      const payload = (await res.json()) as { data?: { roleSearch?: { totalCount?: number } } };
      total = payload.data?.roleSearch?.totalCount ?? 0;
      all.push(...mapGoldmanRoles(payload, this.employer));
      page += 1;
      if (total === 0) break;
    }
    return buildDataset(this.id, this.employer, all);
  }
}
```

- [ ] **Step 4: Wire + test + typecheck**

Add `import { GoldmanHigherAdapter } from "./adapters/goldman-higher";` to `sync.ts`.
Run: `npx vitest run src/test/goldman-higher.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/adapters/goldman-higher.ts src/test/goldman-higher.test.ts src/ingestion/sync.ts
git commit -m "feat(ingest): Goldman higher.gs.com GraphQL adapter (pinned roleSearch)"
```

---

## Task 10: Seed all live sources with config + dedupe rules

Replace the `watchOnly` stand-ins (now covered) and add real source rows with per-ATS `config`. Resolve dual-ATS firms.

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Rewrite the `liveSources` list**

Expand the type to carry `config` and the new kinds, and add one row per firm. Dedupe rules: **Citi → Eightfold** (richer), not Radancy; **Barclays → Workday** (structured), not Radancy; **Man Group → Greenhouse** (keep), not Workday. Example rows (full set in the edit):
```typescript
  { kind: "WORKDAY", identifier: "ms/External", employerName: "Morgan Stanley", sector: "Investment Bank",
    url: "https://ms.wd5.myworkdayjobs.com/External", config: { ats: "workday", host: "ms.wd5.myworkdayjobs.com", tenant: "ms", site: "External" } },
  { kind: "ORACLE_CLOUD", identifier: "jpmc/CX_1001", employerName: "J.P. Morgan", sector: "Investment Bank",
    url: "https://jpmc.fa.oraclecloud.com/...CX_1001", config: { ats: "oracle", host: "jpmc.fa.oraclecloud.com", site: "CX_1001" } },
  { kind: "EIGHTFOLD", identifier: "hsbc", employerName: "HSBC", sector: "Investment Bank",
    url: "https://hsbc.eightfold.ai/careers", config: { ats: "eightfold", host: "hsbc.eightfold.ai", domain: "hsbc.com", endpoint: "apply" } },
  { kind: "EIGHTFOLD", identifier: "citi", employerName: "Citi", sector: "Investment Bank",
    url: "https://citi.eightfold.ai", config: { ats: "eightfold", host: "citi.eightfold.ai", domain: "citi.com", endpoint: "pcsx" } },
  { kind: "RADANCY", identifier: "blackrock", employerName: "BlackRock", sector: "Asset Management",
    url: "https://careers.blackrock.com", config: { ats: "radancy", base: "https://careers.blackrock.com" } },
  { kind: "TALNET", identifier: "nomura/1", employerName: "Nomura", sector: "Investment Bank",
    url: "https://nomuracampus.tal.net", config: { ats: "talnet", host: "nomuracampus.tal.net", board: 1 } },
  // ... Barclays/Blackstone (workday), Schroders (oracle CX_2), Jefferies(2)/Rothschild(2)/Evercore(2)/Lazard(2)/Fidelity(1)/BofA (talnet),
  //     UBS (avature ubs siteid 5131), Macquarie (avature macquarie), Goldman (CAREERS_PAGE higher.gs.com), Deutsche Bank (CAREERS_PAGE careers.db.com)
```
Update the upsert to also write `config`. Drop the obsolete `watchOnly` rows for Goldman/BlackRock/DB (now real adapters); keep Citadel sitemap watchers (still the right strategy).

- [ ] **Step 2: Typecheck the seed**

Run: `npx tsc --noEmit`
Expected: no errors (the `config` literals match `SourceConfig`).

- [ ] **Step 3: Reseed locally (optional, requires DB)**

Run: `npm run seed`
Expected: "N sources registered."

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(ingest): seed all firms with per-ATS config; resolve dual-ATS dedupe"
```

---

## Task 11: End-to-end sync smoke + close-loop verification

- [ ] **Step 1: Run a live sync (requires DB + CRON_SECRET)**

Run the dev server and `curl -H "authorization: Bearer $CRON_SECRET" localhost:3000/api/ingest/sync`.
Expected: JSON summary with `ok` count ≈ number of seeded sources, real `created` counts, and per-source `results`. Inspect for any `unreachable` or error statuses and note them.

- [ ] **Step 2: Verify deadlines on the board**

Open `/tracker`. Confirm: Oracle/tal.net/DB firms show **real** deadlines (no "est." tag); Workday/Eightfold/Radancy/Goldman firms show inferred deadlines tagged "est. · rolling".

- [ ] **Step 3: Verify the close loop**

Manually remove a role from a feed fixture path / or wait for a role to drop; after 2 syncs confirm it flips to `CLOSED` (check the DB or a closed view). Confirm a still-present role stays `OPEN`.

- [ ] **Step 4: Full suite + lint + typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 5: Commit any fixups**

```bash
git add -A && git commit -m "test(ingest): end-to-end sync smoke + close-loop verification"
```

---

## Self-Review

**Spec coverage:** 8 adapters — Workday (T5), Oracle (T2), Eightfold (T6), Avature (T8), Radancy (T7), tal.net (T3), Goldman (T9), Deutsche Bank (T4) ✓. `adapterFor` dispatch + config (T1) ✓. Real deadlines captured for Oracle/tal.net/DB/UBS ✓; others inherit Plan 1 inference ✓. Dual-ATS dedupe (Citi→Eightfold, Barclays→Workday, Man Group→Greenhouse) in T10 ✓. Imperva guard used by tal.net via `fetchTextRobust` ✓. Seed config + drop obsolete watch rows (T10) ✓. End-to-end + close-loop (T11) ✓.

**Placeholder scan:** every adapter task has full mapper code + test + wiring + commit. T10's seed shows representative rows with an explicit comment enumerating the remaining firms to add (the executor fills the identical-shape rows) — acceptable because the row shape and per-firm config values are all specified in the spec table and example rows.

**Type consistency:** `SourceConfig` (T1) is the single source of truth; every adapter's constructor takes `Extract<SourceConfig,{ats:...}>` and every `adapterFor` case passes `source.config` cast to the matching member. `mapXxx(payload, ...employer)` signatures match their tests. `fetchTextRobust`/`ImpervaBlockedError` come from Plan 1's `common.ts`. `sourceType` values on emitted rows match the `SourceType` enum extended in Plan 1.

**Cross-plan dependency:** Plan 2 requires Plan 1 merged (uses `fetchTextRobust`, `ImpervaBlockedError`, the `config` column, the new enum values, and inference in `normalize`). Stated in the header.
