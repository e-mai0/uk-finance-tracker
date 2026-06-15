import { describe, it, expect } from "vitest";
import {
  composeBoard,
  type BoardListingRow,
  type BoardOpportunity,
  type BoardSource,
} from "../lib/tracker-board";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function listing(over: Partial<BoardListingRow> & { employerName: string }): BoardListingRow {
  return {
    kind: "listing",
    id: over.id ?? over.employerName.toLowerCase(),
    title: "Summer Analyst",
    divisionDesk: null,
    status: "OPEN",
    deadlineAt: null,
    deadlineEstimated: false,
    isRolling: true,
    daysLeft: null,
    score: 50,
    saved: false,
    fresh: false,
    agentTags: [],
    ...over,
  };
}

function opp(over: Partial<BoardOpportunity> & { employerName: string }): BoardOpportunity {
  return { status: "OPEN", ...over };
}

const sources: BoardSource[] = [
  { employerName: "Helvar Capital", lastSuccessfulFetchAt: "2026-06-15T06:00:00.000Z" },
  { employerName: "Jane Street", lastSuccessfulFetchAt: "2026-06-15T05:00:00.000Z" },
  { employerName: "Evercore", lastSuccessfulFetchAt: null },
];

describe("composeBoard — Opening soon", () => {
  it("lists a monitored firm with no live listing under Opening soon", () => {
    const { rows } = composeBoard({
      listingRows: [listing({ employerName: "Helvar Capital" })],
      allOpportunities: [opp({ employerName: "Helvar Capital" })],
      sources,
      filtersActive: false,
      now: NOW,
    });

    const tracked = rows.filter((r) => r.kind === "tracked").map((r) => r.employerName);
    // Helvar has a live listing → not in Opening soon. Jane Street & Evercore do.
    expect(tracked).toEqual(["Evercore", "Jane Street"]);
    // Live listing comes before the tracked firms.
    expect(rows[0]).toMatchObject({ kind: "listing", employerName: "Helvar Capital" });
  });

  it("suppresses Opening soon while the user is filtering", () => {
    const { rows } = composeBoard({
      listingRows: [listing({ employerName: "Helvar Capital" })],
      allOpportunities: [opp({ employerName: "Helvar Capital" })],
      sources,
      filtersActive: true,
      now: NOW,
    });
    expect(rows.every((r) => r.kind === "listing")).toBe(true);
  });
});

describe("composeBoard — a new listing goes live (the UI transition)", () => {
  // Before: Jane Street is monitored but has no opportunity → Opening soon.
  const before = composeBoard({
    listingRows: [listing({ employerName: "Helvar Capital" })],
    allOpportunities: [opp({ employerName: "Helvar Capital" })],
    sources,
    filtersActive: false,
    now: NOW,
  });

  // After: Jane Street publishes an OPEN role. The page re-queries (force-dynamic)
  // and re-maps; Jane Street is now a live listing row and an opportunity.
  const after = composeBoard({
    listingRows: [
      listing({ employerName: "Helvar Capital" }),
      listing({ employerName: "Jane Street", id: "js-1" }),
    ],
    allOpportunities: [
      opp({ employerName: "Helvar Capital" }),
      opp({ employerName: "Jane Street" }),
    ],
    sources,
    filtersActive: false,
    now: NOW,
  });

  it("moves the firm out of Opening soon", () => {
    const beforeTracked = before.rows.filter((r) => r.kind === "tracked").map((r) => r.employerName);
    const afterTracked = after.rows.filter((r) => r.kind === "tracked").map((r) => r.employerName);
    expect(beforeTracked).toContain("Jane Street");
    expect(afterTracked).not.toContain("Jane Street"); // no longer "opening soon"
    expect(afterTracked).toEqual(["Evercore"]); // and no duplicate row remains
  });

  it("shows the firm as a live listing row", () => {
    const afterLive = after.rows.filter((r) => r.kind === "listing").map((r) => r.employerName);
    expect(afterLive).toContain("Jane Street");
  });

  it("bumps the live count and keeps the tracked total stable", () => {
    expect(before.stats.live).toBe(1);
    expect(after.stats.live).toBe(2);
    // 3 distinct monitored firms throughout (Jane Street was always counted).
    expect(before.stats.tracked).toBe(3);
    expect(after.stats.tracked).toBe(3);
  });
});

describe("composeBoard — ordering & counts", () => {
  it("orders live before closed, and counts a stated deadline closing this week", () => {
    const { rows, stats } = composeBoard({
      listingRows: [
        listing({ employerName: "Closed Co", status: "CLOSED", id: "c1" }),
        listing({
          employerName: "Soon Co",
          id: "s1",
          status: "OPEN",
          isRolling: false,
          deadlineAt: "2026-06-18T00:00:00.000Z",
          daysLeft: 3,
        }),
      ],
      allOpportunities: [
        opp({ employerName: "Closed Co", status: "CLOSED" }),
        opp({
          employerName: "Soon Co",
          status: "OPEN",
          isRolling: false,
          deadlineAt: "2026-06-18T00:00:00.000Z",
        }),
      ],
      sources: [],
      filtersActive: false,
      now: NOW,
    });

    const listings = rows.filter((r) => r.kind === "listing").map((r) => r.employerName);
    expect(listings).toEqual(["Soon Co", "Closed Co"]); // live before closed
    expect(stats.closingThisWeek).toBe(1);
  });
});
