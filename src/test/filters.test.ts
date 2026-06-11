import { describe, it, expect } from "vitest";
import {
  parseFilters,
  applyFilters,
  applySort,
  EMPTY_FILTERS,
  offersSponsorship,
  type TrackerItem,
} from "../lib/filters";

function item(overrides: Partial<TrackerItem>): TrackerItem {
  return {
    id: Math.random().toString(36).slice(2),
    employerName: "Goldman Sachs",
    employerSlug: "goldman-sachs",
    title: "Investment Banking Summer Analyst",
    roleFamily: "IB",
    divisionDesk: "IBD",
    location: "London",
    status: "OPEN",
    opensAt: "2026-09-01",
    deadlineAt: "2026-11-01",
    lastSeenAt: "2026-06-01",
    firstSeenAt: "2026-05-20",
    tags: ["m&a", "excel"],
    ...overrides,
  };
}

describe("parseFilters", () => {
  it("returns defaults for empty params", () => {
    expect(parseFilters({})).toEqual(EMPTY_FILTERS);
  });

  it("parses arrays, flags and sort", () => {
    const f = parseFilters({
      q: "goldman",
      status: "OPEN,CLOSED",
      location: "London",
      family: "IB,MARKETS",
      deadline: "1",
      sponsorship: "true",
      sort: "deadline",
    });
    expect(f.search).toBe("goldman");
    expect(f.status).toEqual(["OPEN", "CLOSED"]);
    expect(f.roleFamily).toEqual(["IB", "MARKETS"]);
    expect(f.hasDeadline).toBe(true);
    expect(f.sponsorshipAvailable).toBe(true);
    expect(f.sort).toBe("deadline");
  });

  it("falls back to the default sort when invalid", () => {
    expect(parseFilters({ sort: "nonsense" }).sort).toBe("best_match");
  });

  it("parseFilters reads filter=starred", () => {
    expect(parseFilters({ filter: "starred" }).starred).toBe(true);
    expect(parseFilters({}).starred).toBe(false);
  });
});

describe("applyFilters", () => {
  const items = [
    item({ employerName: "Goldman Sachs", roleFamily: "IB", location: "London", status: "OPEN" }),
    item({ employerName: "Jane Street", roleFamily: "QUANT", location: "London", status: "OPEN", tags: ["python"], saved: true }),
    item({ employerName: "BlackRock", roleFamily: "ASSET_MGMT", location: "Edinburgh", status: "OPENING_SOON", deadlineAt: null, saved: false }),
  ];

  it("matches search across employer, family label and tags", () => {
    expect(applyFilters(items, { ...EMPTY_FILTERS, search: "jane" })).toHaveLength(1);
    expect(applyFilters(items, { ...EMPTY_FILTERS, search: "python" })).toHaveLength(1);
    expect(applyFilters(items, { ...EMPTY_FILTERS, search: "edinburgh" })).toHaveLength(1);
  });

  it("filters by status, location and family", () => {
    expect(applyFilters(items, { ...EMPTY_FILTERS, status: ["OPEN"] })).toHaveLength(2);
    expect(applyFilters(items, { ...EMPTY_FILTERS, location: ["Edinburgh"] })).toHaveLength(1);
    expect(applyFilters(items, { ...EMPTY_FILTERS, roleFamily: ["QUANT"] })).toHaveLength(1);
  });

  it("filters by deadline availability", () => {
    const withDeadline = applyFilters(items, { ...EMPTY_FILTERS, hasDeadline: true });
    expect(withDeadline).toHaveLength(2);
  });

  it("filter=starred keeps only saved items", () => {
    expect(applyFilters(items, { ...EMPTY_FILTERS, starred: true })).toHaveLength(1);
    expect(applyFilters(items, { ...EMPTY_FILTERS, starred: true })[0].employerName).toBe("Jane Street");
  });
});

describe("offersSponsorship", () => {
  it("detects sponsorship language", () => {
    expect(offersSponsorship("Visa sponsorship is available")).toBe(true);
    expect(offersSponsorship("Must have the right to work")).toBe(false);
    expect(offersSponsorship(null)).toBe(false);
  });
});

describe("applySort", () => {
  it("sorts by best match (score desc)", () => {
    const items = [
      item({ id: "a", score: 40 }),
      item({ id: "b", score: 90 }),
      item({ id: "c", score: 65 }),
    ];
    expect(applySort(items, "best_match").map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by deadline ascending with nulls last", () => {
    const items = [
      item({ id: "none", deadlineAt: null }),
      item({ id: "late", deadlineAt: "2026-12-01" }),
      item({ id: "early", deadlineAt: "2026-07-01" }),
    ];
    expect(applySort(items, "deadline").map((i) => i.id)).toEqual([
      "early",
      "late",
      "none",
    ]);
  });

  it("sorts employers alphabetically", () => {
    const items = [
      item({ id: "1", employerName: "Nomura" }),
      item({ id: "2", employerName: "Barclays" }),
      item({ id: "3", employerName: "Citi" }),
    ];
    expect(applySort(items, "employer").map((i) => i.employerName)).toEqual([
      "Barclays",
      "Citi",
      "Nomura",
    ]);
  });
});
