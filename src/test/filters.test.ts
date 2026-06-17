import { describe, it, expect } from "vitest";
import {
  parseFilters,
  applyFilters,
  applySort,
  hasActiveFilters,
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
    programmeType: "SUMMER_INTERNSHIP",
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

  it("parses the season query key into programmeType", () => {
    const f = parseFilters({ season: "SPRING_WEEK,OFF_CYCLE" });
    expect(f.programmeType).toEqual(["SPRING_WEEK", "OFF_CYCLE"]);
  });

  it("ignores a region query key (region removed, ADR-005)", () => {
    const f = parseFilters({ region: "UK,US" });
    // No `region` field exists on FilterParams anymore; the key is simply dropped.
    expect(f).not.toHaveProperty("region");
  });

  it("defaults programmeType to an empty array", () => {
    const f = parseFilters({});
    expect(f.programmeType).toEqual([]);
  });
});

describe("hasActiveFilters", () => {
  it("is false for empty filters", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("is true when a season facet is selected", () => {
    expect(
      hasActiveFilters({ ...EMPTY_FILTERS, programmeType: ["SPRING_WEEK"] }),
    ).toBe(true);
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

  // ADR-005: the board is UK-only, so region is gone; the season facet remains.
  const seasonItems = [
    item({ employerName: "Spring Co", programmeType: "SPRING_WEEK" }),
    item({ employerName: "Summer Co", programmeType: "SUMMER_INTERNSHIP" }),
    item({ employerName: "Offcycle Co", programmeType: "OFF_CYCLE" }),
  ];

  it("filters by programmeType (season)", () => {
    const sw = applyFilters(seasonItems, {
      ...EMPTY_FILTERS,
      programmeType: ["SPRING_WEEK"],
    });
    expect(sw).toHaveLength(1);
    expect(sw[0].employerName).toBe("Spring Co");
  });

  it("filters out spring weeks when filtering by summer internship", () => {
    const summer = applyFilters(seasonItems, {
      ...EMPTY_FILTERS,
      programmeType: ["SUMMER_INTERNSHIP"],
    });
    expect(summer.map((i) => i.programmeType)).toEqual(["SUMMER_INTERNSHIP"]);
  });

  it("supports selecting multiple seasons (OR within the facet)", () => {
    const res = applyFilters(seasonItems, {
      ...EMPTY_FILTERS,
      programmeType: ["SPRING_WEEK", "OFF_CYCLE"],
    });
    expect(res.map((i) => i.employerName).sort()).toEqual([
      "Offcycle Co",
      "Spring Co",
    ]);
  });

  it("treats an empty season facet as a no-op", () => {
    expect(
      applyFilters(seasonItems, {
        ...EMPTY_FILTERS,
        programmeType: [],
      }),
    ).toHaveLength(seasonItems.length);
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
