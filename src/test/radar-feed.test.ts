import { describe, it, expect } from "vitest";
import { composeRadarFeed, type RadarFeedSource } from "../lib/radar-feed";
import type { TrackerItem } from "../lib/filters";
import type { OpportunityStatus, RoleFamily } from "@prisma/client";

const NOW = new Date("2026-06-15T12:00:00.000Z");

/** Minimal TrackerItem factory — only the fields the feed reads matter. */
function item(over: Partial<TrackerItem> & { id: string }): TrackerItem {
  return {
    employerName: "Helvar Capital",
    employerSlug: "helvar-capital",
    title: "Summer Analyst",
    roleFamily: "IBD" as RoleFamily,
    programmeType: "SUMMER_INTERNSHIP" as TrackerItem["programmeType"],
    location: "London",
    status: "OPEN" as OpportunityStatus,
    opensAt: null,
    deadlineAt: null,
    lastSeenAt: NOW,
    firstSeenAt: NOW,
    tags: [],
    deadlineEstimated: false,
    isRolling: false,
    closedAt: null,
    closeReason: null,
    ...over,
  };
}

/** Build a Date `hours` before NOW. */
function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

/** Build a Date `days` after NOW (negative = past). */
function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

function source(over: Partial<RadarFeedSource> & { employerName: string }): RadarFeedSource {
  return {
    enabled: true,
    watchOnly: false,
    lastStatus: "ok",
    lastChangedAt: null,
    lastSuccessfulFetchAt: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// closingSoon
// ---------------------------------------------------------------------------

describe("composeRadarFeed — closingSoon", () => {
  it("includes OPEN roles with a real deadline 0..closingSoonDays out, soonest-first", () => {
    const { closingSoon } = composeRadarFeed({
      items: [
        item({ id: "far", deadlineAt: daysFromNow(6) }),
        item({ id: "near", deadlineAt: daysFromNow(2) }),
        item({ id: "today", deadlineAt: daysFromNow(0) }),
      ],
      sources: [],
      now: NOW,
    });
    expect(closingSoon.map((i) => i.id)).toEqual(["today", "near", "far"]);
  });

  it("excludes estimated deadlines (no false urgency)", () => {
    const { closingSoon } = composeRadarFeed({
      items: [item({ id: "est", deadlineAt: daysFromNow(2), deadlineEstimated: true })],
      sources: [],
      now: NOW,
    });
    expect(closingSoon).toEqual([]);
  });

  it("excludes rolling deadlines", () => {
    const { closingSoon } = composeRadarFeed({
      items: [item({ id: "roll", deadlineAt: daysFromNow(2), isRolling: true })],
      sources: [],
      now: NOW,
    });
    expect(closingSoon).toEqual([]);
  });

  it("excludes past deadlines (daysUntil >= 0)", () => {
    const { closingSoon } = composeRadarFeed({
      items: [item({ id: "past", deadlineAt: daysFromNow(-1) })],
      sources: [],
      now: NOW,
    });
    expect(closingSoon).toEqual([]);
  });

  it("excludes deadlines beyond the window", () => {
    const { closingSoon } = composeRadarFeed({
      items: [item({ id: "out", deadlineAt: daysFromNow(20) })],
      sources: [],
      now: NOW,
    });
    expect(closingSoon).toEqual([]);
  });

  it("excludes non-OPEN statuses and items without a deadline", () => {
    const { closingSoon } = composeRadarFeed({
      items: [
        item({ id: "closed", status: "CLOSED" as OpportunityStatus, deadlineAt: daysFromNow(2) }),
        item({ id: "nodate", deadlineAt: null }),
      ],
      sources: [],
      now: NOW,
    });
    expect(closingSoon).toEqual([]);
  });

  it("respects a custom closingSoonDays window", () => {
    const { closingSoon } = composeRadarFeed({
      items: [item({ id: "d3", deadlineAt: daysFromNow(3) })],
      sources: [],
      now: NOW,
      closingSoonDays: 2,
    });
    expect(closingSoon).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fresh / isOvernight / overflow
// ---------------------------------------------------------------------------

describe("composeRadarFeed — fresh window + isOvernight boundary", () => {
  it("a 35h-old item is fresh and isOvernight=true", () => {
    const { fresh } = composeRadarFeed({
      items: [item({ id: "h35", firstSeenAt: hoursAgo(35) })],
      sources: [],
      now: NOW,
    });
    expect(fresh.map((i) => i.id)).toEqual(["h35"]);
    expect(fresh[0].isOvernight).toBe(true);
  });

  it("a 40h-old item is fresh but isOvernight=false", () => {
    const { fresh } = composeRadarFeed({
      items: [item({ id: "h40", firstSeenAt: hoursAgo(40) })],
      sources: [],
      now: NOW,
    });
    expect(fresh.map((i) => i.id)).toEqual(["h40"]);
    expect(fresh[0].isOvernight).toBe(false);
  });

  it("an 8-day-old item is NOT in fresh at all", () => {
    const { fresh } = composeRadarFeed({
      items: [item({ id: "d8", firstSeenAt: hoursAgo(8 * 24) })],
      sources: [],
      now: NOW,
    });
    expect(fresh).toEqual([]);
  });

  it("sorts fresh newest-first by firstSeenAt", () => {
    const { fresh } = composeRadarFeed({
      items: [
        item({ id: "old", firstSeenAt: hoursAgo(120) }),
        item({ id: "new", firstSeenAt: hoursAgo(2) }),
        item({ id: "mid", firstSeenAt: hoursAgo(50) }),
      ],
      sources: [],
      now: NOW,
    });
    expect(fresh.map((i) => i.id)).toEqual(["new", "mid", "old"]);
  });

  it("caps fresh to freshLimit and reports freshOverflow", () => {
    const items = Array.from({ length: 9 }, (_, i) =>
      item({ id: `f${i}`, firstSeenAt: hoursAgo(i + 1) }),
    );
    const { fresh, freshOverflow } = composeRadarFeed({
      items,
      sources: [],
      now: NOW,
      freshLimit: 6,
    });
    expect(fresh).toHaveLength(6);
    expect(freshOverflow).toBe(3);
    // The capped set is the newest 6 (smallest hoursAgo).
    expect(fresh.map((i) => i.id)).toEqual(["f0", "f1", "f2", "f3", "f4", "f5"]);
  });

  it("freshOverflow is 0 when in-window count is within the cap", () => {
    const { fresh, freshOverflow } = composeRadarFeed({
      items: [item({ id: "a", firstSeenAt: hoursAgo(2) })],
      sources: [],
      now: NOW,
      freshLimit: 6,
    });
    expect(fresh).toHaveLength(1);
    expect(freshOverflow).toBe(0);
  });

  it("respects a custom overnightHours boundary", () => {
    const { fresh } = composeRadarFeed({
      items: [item({ id: "h20", firstSeenAt: hoursAgo(20) })],
      sources: [],
      now: NOW,
      overnightHours: 12,
    });
    expect(fresh[0].isOvernight).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// openingSoon
// ---------------------------------------------------------------------------

describe("composeRadarFeed — openingSoon", () => {
  it("lists OPENING_SOON items ordered by opensAt asc", () => {
    const { openingSoon } = composeRadarFeed({
      items: [
        item({ id: "late", status: "OPENING_SOON" as OpportunityStatus, opensAt: daysFromNow(10) }),
        item({ id: "soon", status: "OPENING_SOON" as OpportunityStatus, opensAt: daysFromNow(2) }),
        item({ id: "open", status: "OPEN" as OpportunityStatus, opensAt: daysFromNow(1) }),
      ],
      sources: [],
      now: NOW,
    });
    expect(openingSoon.map((i) => i.id)).toEqual(["soon", "late"]);
  });
});

// ---------------------------------------------------------------------------
// recentlyClosed
// ---------------------------------------------------------------------------

describe("composeRadarFeed — recentlyClosed", () => {
  it("includes CLOSED roles closed within weekDays, newest-closed-first", () => {
    const { recentlyClosed } = composeRadarFeed({
      items: [
        item({ id: "c5", status: "CLOSED" as OpportunityStatus, closedAt: daysFromNow(-5) }),
        item({ id: "c1", status: "CLOSED" as OpportunityStatus, closedAt: daysFromNow(-1) }),
      ],
      sources: [],
      now: NOW,
    });
    expect(recentlyClosed.map((i) => i.id)).toEqual(["c1", "c5"]);
  });

  it("excludes a role closed 10 days ago (outside the window)", () => {
    const { recentlyClosed } = composeRadarFeed({
      items: [item({ id: "old", status: "CLOSED" as OpportunityStatus, closedAt: daysFromNow(-10) })],
      sources: [],
      now: NOW,
    });
    expect(recentlyClosed).toEqual([]);
  });

  it("excludes a CLOSED role with closedAt=null (and does not crash)", () => {
    const { recentlyClosed } = composeRadarFeed({
      items: [item({ id: "nullclose", status: "CLOSED" as OpportunityStatus, closedAt: null })],
      sources: [],
      now: NOW,
    });
    expect(recentlyClosed).toEqual([]);
  });

  it("excludes non-CLOSED items even if they have a recent closedAt", () => {
    const { recentlyClosed } = composeRadarFeed({
      items: [item({ id: "open", status: "OPEN" as OpportunityStatus, closedAt: daysFromNow(-1) })],
      sources: [],
      now: NOW,
    });
    expect(recentlyClosed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// coverage
// ---------------------------------------------------------------------------

describe("composeRadarFeed — coverage", () => {
  it("counts liveFeeds, watching, needsAttention and tracked across a mixed source set", () => {
    const sources: RadarFeedSource[] = [
      // live feed
      source({
        employerName: "Jane Street",
        watchOnly: false,
        enabled: true,
        lastStatus: "ok 12 roles",
        lastSuccessfulFetchAt: "2026-06-15T06:00:00.000Z",
      }),
      // unreachable (bot-challenged) → needs attention, not live
      source({
        employerName: "Citadel",
        watchOnly: false,
        enabled: true,
        lastStatus: "unreachable: challenge",
      }),
      // disabled → needs attention
      source({ employerName: "Evercore", enabled: false, lastStatus: "ok" }),
      // watch-only that changed → watching + needs attention
      source({
        employerName: "Capula",
        watchOnly: true,
        enabled: true,
        lastChangedAt: "2026-06-14T00:00:00.000Z",
        lastSuccessfulFetchAt: "2026-06-15T05:00:00.000Z",
      }),
      // watch-only that has NOT changed → watching, NOT needs attention
      source({ employerName: "De Shaw", watchOnly: true, enabled: true, lastChangedAt: null }),
    ];

    const { coverage } = composeRadarFeed({
      items: [item({ id: "x", employerName: "Millennium" })],
      sources,
      now: NOW,
    });

    expect(coverage.liveFeeds).toBe(1); // only Jane Street
    expect(coverage.watching).toBe(2); // Capula + De Shaw
    // Citadel (unreachable) + Evercore (disabled) + Capula (changed watcher)
    expect(coverage.needsAttention).toBe(3);
    // distinct firms: 5 sources ∪ Millennium listing = 6
    expect(coverage.tracked).toBe(6);
    // max lastSuccessfulFetchAt across sources
    expect(coverage.lastSweepAt).toBe("2026-06-15T06:00:00.000Z");
  });

  it("lastSweepAt is null when no source has fetched", () => {
    const { coverage } = composeRadarFeed({
      items: [],
      sources: [source({ employerName: "A", lastSuccessfulFetchAt: null })],
      now: NOW,
    });
    expect(coverage.lastSweepAt).toBeNull();
  });

  it("treats a disabled unreachable watcher's attention count without double-effecting other counts", () => {
    const { coverage } = composeRadarFeed({
      items: [],
      sources: [
        source({ employerName: "OnlyLive", watchOnly: false, enabled: true, lastStatus: "ok" }),
      ],
      now: NOW,
    });
    expect(coverage.liveFeeds).toBe(1);
    expect(coverage.watching).toBe(0);
    expect(coverage.needsAttention).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mixed Date / ISO-string inputs
// ---------------------------------------------------------------------------

describe("composeRadarFeed — accepts Date and ISO-string inputs", () => {
  it("normalizes string and Date dates the same way", () => {
    const isoResult = composeRadarFeed({
      items: [item({ id: "iso", deadlineAt: daysFromNow(3).toISOString() })],
      sources: [],
      now: NOW,
    });
    const dateResult = composeRadarFeed({
      items: [item({ id: "date", deadlineAt: daysFromNow(3) })],
      sources: [],
      now: NOW,
    });
    expect(isoResult.closingSoon).toHaveLength(1);
    expect(dateResult.closingSoon).toHaveLength(1);
  });

  it("ignores unparseable dates without crashing", () => {
    const { closingSoon, fresh, recentlyClosed } = composeRadarFeed({
      items: [
        item({ id: "bad", deadlineAt: "not-a-date", firstSeenAt: "garbage" as unknown as string }),
        item({
          id: "badclose",
          status: "CLOSED" as OpportunityStatus,
          closedAt: "nope",
          firstSeenAt: "garbage" as unknown as string,
        }),
      ],
      sources: [source({ employerName: "S", lastSuccessfulFetchAt: "also-bad" })],
      now: NOW,
    });
    expect(closingSoon).toEqual([]);
    expect(fresh).toEqual([]);
    expect(recentlyClosed).toEqual([]);
  });
});
