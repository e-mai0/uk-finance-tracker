// src/test/radar-rework-review.test.ts
// Adversarial-review held-out tests for the ADR-012 radar rework (digest +
// per-user closed markers, closingSoon/openingSoon dropped). Independent
// fixtures from the author's suite and the prior review suite.
import { describe, it, expect } from "vitest";
import { composeRadarFeed, type RadarFeedSource } from "@/lib/radar-feed";
import type { TrackerItem } from "@/lib/filters";
import type { OpportunityStatus, ProgrammeType, RoleFamily } from "@prisma/client";

const T0 = new Date("2026-07-01T08:00:00Z");
const hoursAgo = (h: number) => new Date(T0.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => hoursAgo(d * 24);

let seq = 0;
function role(over: Partial<TrackerItem> = {}): TrackerItem {
  seq += 1;
  return {
    id: over.id ?? `rev-${seq}`,
    employerName: "Meridian Partners",
    employerSlug: "meridian-partners",
    title: "Summer Analyst 2027",
    roleFamily: "INVESTMENT_BANKING" as RoleFamily,
    programmeType: "SUMMER_INTERNSHIP" as ProgrammeType,
    location: "London",
    status: "OPEN" as OpportunityStatus,
    lastSeenAt: T0,
    firstSeenAt: daysAgo(30),
    tags: [],
    ...over,
  };
}

function source(over: Partial<RadarFeedSource> = {}): RadarFeedSource {
  return {
    employerName: "Meridian Partners",
    enabled: true,
    watchOnly: false,
    lastStatus: "ok",
    lastChangedAt: null,
    lastSuccessfulFetchAt: daysAgo(1),
    ...over,
  };
}

describe("radar-rework [review] digest derives from section arrays, not raw rows", () => {
  it("newCount includes the overflow beyond the cap; closedCount excludes out-of-window and null-closedAt CLOSED rows", () => {
    // 8 in-window fresh (cap 6 → overflow 2) — raw "new" would be 8 either way,
    // but closed is engineered so raw CLOSED count (4) ≠ rendered count (2).
    const freshItems = Array.from({ length: 8 }, (_, k) =>
      role({ id: `f${k}`, firstSeenAt: hoursAgo(k + 1) }),
    );
    const closedItems = [
      role({ id: "c-in-1", status: "CLOSED" as OpportunityStatus, closedAt: daysAgo(1) }),
      role({ id: "c-in-2", status: "CLOSED" as OpportunityStatus, closedAt: daysAgo(3) }),
      role({ id: "c-old", status: "CLOSED" as OpportunityStatus, closedAt: daysAgo(10) }),
      role({ id: "c-null", status: "CLOSED" as OpportunityStatus, closedAt: null }),
    ];

    const feed = composeRadarFeed({
      items: [...freshItems, ...closedItems],
      sources: [source()],
      now: T0,
    });

    expect(feed.fresh).toHaveLength(6);
    expect(feed.freshOverflow).toBe(2);
    expect(feed.digest.newCount).toBe(8);
    expect(feed.recentlyClosed.map((i) => i.id)).toEqual(["c-in-1", "c-in-2"]);
    expect(feed.digest.closedCount).toBe(2);
  });

  it("a role that opened AND closed inside the window is counted as both events (documented ADR-012 semantics)", () => {
    const both = role({
      id: "both-1",
      status: "CLOSED" as OpportunityStatus,
      firstSeenAt: daysAgo(2),
      closedAt: daysAgo(1),
    });

    const feed = composeRadarFeed({ items: [both], sources: [source()], now: T0 });

    expect(feed.fresh.map((i) => i.id)).toEqual(["both-1"]);
    expect(feed.recentlyClosed.map((i) => i.id)).toEqual(["both-1"]);
    expect(feed.digest.newCount).toBe(1);
    expect(feed.digest.closedCount).toBe(1);
  });
});

describe("radar-rework [review] per-user closed markers", () => {
  const closed = (id: string) =>
    role({ id, status: "CLOSED" as OpportunityStatus, closedAt: daysAgo(2) });

  it("applied-only, saved-only, and both-sets roles each carry exactly the right flags", () => {
    const feed = composeRadarFeed({
      items: [closed("only-applied"), closed("only-saved"), closed("in-both"), closed("in-neither")],
      sources: [source()],
      now: T0,
      savedIds: new Set(["only-saved", "in-both"]),
      appliedIds: new Set(["only-applied", "in-both"]),
    });

    const byId = Object.fromEntries(feed.recentlyClosed.map((i) => [i.id, i]));
    expect(byId["only-applied"]).toMatchObject({ youApplied: true, youSaved: false });
    expect(byId["only-saved"]).toMatchObject({ youApplied: false, youSaved: true });
    expect(byId["in-both"]).toMatchObject({ youApplied: true, youSaved: true });
    expect(byId["in-neither"]).toMatchObject({ youApplied: false, youSaved: false });
  });

  it("set membership never resurrects an out-of-window closed role", () => {
    const feed = composeRadarFeed({
      items: [closed("recent"), role({ id: "ancient", status: "CLOSED" as OpportunityStatus, closedAt: daysAgo(20) })],
      sources: [source()],
      now: T0,
      savedIds: new Set(["ancient"]),
      appliedIds: new Set(["ancient"]),
    });

    expect(feed.recentlyClosed.map((i) => i.id)).toEqual(["recent"]);
  });

  it("marker intersection is exact-id: case variants never match", () => {
    const feed = composeRadarFeed({
      items: [closed("role-b1")],
      sources: [source()],
      now: T0,
      savedIds: new Set(["ROLE-B1"]),
      appliedIds: new Set(["Role-B1"]),
    });

    expect(feed.recentlyClosed[0]).toMatchObject({ youSaved: false, youApplied: false });
  });
});

describe("radar-rework [review] digest source stats + coverage invariants", () => {
  it("sourcesChecked counts enabled sources only; disabled sources still raise needsAttention (never hidden)", () => {
    const sources = [
      source({ employerName: "A", enabled: true }),
      source({ employerName: "B", enabled: true, watchOnly: true }),
      source({ employerName: "C", enabled: true, lastStatus: "unreachable (bot challenge)" }),
      source({ employerName: "D", enabled: false }),
      source({ employerName: "E", enabled: false }),
    ];

    const feed = composeRadarFeed({ items: [], sources, now: T0 });

    expect(feed.digest.sourcesChecked).toBe(3);
    // needsAttention: C (unreachable) + D + E (disabled) — broken/off sources stay visible.
    expect(feed.coverage.needsAttention).toBe(3);
  });

  it("with no successful fetch anywhere, lastSyncAt is null and the feed still composes", () => {
    const feed = composeRadarFeed({
      items: [role({ id: "f1", firstSeenAt: hoursAgo(4) })],
      sources: [source({ lastSuccessfulFetchAt: null }), source({ employerName: "B", lastSuccessfulFetchAt: null })],
      now: T0,
    });

    expect(feed.digest.lastSyncAt).toBeNull();
    expect(feed.coverage.lastSweepAt).toBeNull();
    expect(feed.fresh.map((i) => i.id)).toEqual(["f1"]);
    expect(feed.digest.newCount).toBe(1);
  });

  it("fresh is newest-first and isOvernight is the tight hour subset", () => {
    const feed = composeRadarFeed({
      items: [
        role({ id: "older", firstSeenAt: daysAgo(5) }),
        role({ id: "newest", firstSeenAt: hoursAgo(6) }),
        role({ id: "middle", firstSeenAt: daysAgo(2) }),
      ],
      sources: [source()],
      now: T0,
    });

    expect(feed.fresh.map((i) => i.id)).toEqual(["newest", "middle", "older"]);
    expect(feed.fresh.map((i) => i.isOvernight)).toEqual([true, false, false]);
  });
});
