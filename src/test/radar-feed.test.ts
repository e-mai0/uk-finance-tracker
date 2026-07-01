import { describe, it, expect } from "vitest";
import { composeRadarFeed, type RadarFeedSource } from "../lib/radar-feed";
import type { TrackerItem } from "../lib/filters";
import type { OpportunityStatus, RoleFamily } from "@prisma/client";

/**
 * ADR-012 re-scope: Radar = "what Cyclops did while you were away".
 * closingSoon/openingSoon were dropped from the feed (spec change), so their
 * suites are gone; new suites pin the sync digest (counts derived from the
 * same arrays the sections render) and the per-user saved/applied markers on
 * closed roles (pure set-intersection over injected id sets).
 */

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
// recentlyClosed (content preserved from the pre-ADR-012 feed)
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

  it("keeps closeReason/closedAt on closed rows (the section renders them)", () => {
    const { recentlyClosed } = composeRadarFeed({
      items: [
        item({
          id: "c1",
          status: "CLOSED" as OpportunityStatus,
          closedAt: daysFromNow(-1),
          closeReason: "deadline passed",
        }),
      ],
      sources: [],
      now: NOW,
    });
    expect(recentlyClosed[0].closeReason).toBe("deadline passed");
    expect(recentlyClosed[0].closedAt).toEqual(daysFromNow(-1));
  });
});

// ---------------------------------------------------------------------------
// per-user saved/applied markers on closed roles (ADR-012 §3)
// ---------------------------------------------------------------------------

describe("composeRadarFeed — saved/applied markers on recentlyClosed", () => {
  const closed = (id: string) =>
    item({ id, status: "CLOSED" as OpportunityStatus, closedAt: daysFromNow(-1) });

  it("marks youSaved / youApplied only on exact id intersection", () => {
    const { recentlyClosed } = composeRadarFeed({
      items: [closed("c1"), closed("c2"), closed("c3")],
      sources: [],
      now: NOW,
      savedIds: new Set(["c1"]),
      appliedIds: new Set(["c3"]),
    });
    const byId = new Map(recentlyClosed.map((i) => [i.id, i]));
    expect(byId.get("c1")).toMatchObject({ youSaved: true, youApplied: false });
    expect(byId.get("c2")).toMatchObject({ youSaved: false, youApplied: false });
    expect(byId.get("c3")).toMatchObject({ youSaved: false, youApplied: true });
  });

  it("a role both saved and applied carries both flags", () => {
    const { recentlyClosed } = composeRadarFeed({
      items: [closed("both")],
      sources: [],
      now: NOW,
      savedIds: new Set(["both"]),
      appliedIds: new Set(["both"]),
    });
    expect(recentlyClosed[0].youSaved).toBe(true);
    expect(recentlyClosed[0].youApplied).toBe(true);
  });

  it("empty sets mark nothing, and omitted sets behave as empty", () => {
    const explicit = composeRadarFeed({
      items: [closed("c1")],
      sources: [],
      now: NOW,
      savedIds: new Set<string>(),
      appliedIds: new Set<string>(),
    });
    const omitted = composeRadarFeed({
      items: [closed("c1")],
      sources: [],
      now: NOW,
    });
    for (const feed of [explicit, omitted]) {
      expect(feed.recentlyClosed[0].youSaved).toBe(false);
      expect(feed.recentlyClosed[0].youApplied).toBe(false);
    }
  });

  it("non-matching and near-miss ids (case/whitespace) never mark — exact-id membership, no normalization", () => {
    // Cross-user isolation itself lives in getUserOpportunityIdSets' userId
    // filter; this layer's contribution is exact-id membership — wrong ids and
    // near-misses (case, stray whitespace) must never light up markers.
    const { recentlyClosed } = composeRadarFeed({
      items: [closed("b1"), closed("b2")],
      sources: [],
      now: NOW,
      savedIds: new Set(["a1", "B1", "b1 "]), // wrong ids + case/whitespace near-misses
      appliedIds: new Set(["a2"]),
    });
    for (const row of recentlyClosed) {
      expect(row.youSaved).toBe(false);
      expect(row.youApplied).toBe(false);
    }
  });

  it("markers never resurrect out-of-window or non-closed roles", () => {
    const { recentlyClosed, fresh } = composeRadarFeed({
      items: [
        item({
          id: "oldClosed",
          status: "CLOSED" as OpportunityStatus,
          closedAt: daysFromNow(-30),
          firstSeenAt: hoursAgo(60 * 24),
        }),
        item({ id: "stillOpen", firstSeenAt: hoursAgo(2) }),
      ],
      sources: [],
      now: NOW,
      savedIds: new Set(["oldClosed", "stillOpen"]),
      appliedIds: new Set(["oldClosed", "stillOpen"]),
    });
    expect(recentlyClosed).toEqual([]);
    expect(fresh.map((i) => i.id)).toEqual(["stillOpen"]);
  });
});

// ---------------------------------------------------------------------------
// sync digest (ADR-012 §1) — counts must be the section arrays' lengths
// ---------------------------------------------------------------------------

describe("composeRadarFeed — sync digest consistency", () => {
  it("digest counts equal the rendered section lengths on a fixture where raw counts differ", () => {
    // 6 raw items but only 2 are "new in window" and 1 "closed in window":
    // a digest computed from anything other than the section arrays diverges.
    const { digest, fresh, freshOverflow, recentlyClosed } = composeRadarFeed({
      items: [
        item({ id: "new1", firstSeenAt: hoursAgo(2) }),
        item({ id: "new2", firstSeenAt: hoursAgo(30) }),
        item({ id: "stale", firstSeenAt: hoursAgo(30 * 24) }),
        item({ id: "closedIn", status: "CLOSED" as OpportunityStatus, closedAt: daysFromNow(-2), firstSeenAt: hoursAgo(30 * 24) }),
        item({ id: "closedOut", status: "CLOSED" as OpportunityStatus, closedAt: daysFromNow(-20), firstSeenAt: hoursAgo(30 * 24) }),
        item({ id: "closedNull", status: "CLOSED" as OpportunityStatus, closedAt: null, firstSeenAt: hoursAgo(30 * 24) }),
      ],
      sources: [],
      now: NOW,
    });
    expect(digest.newCount).toBe(2);
    expect(digest.newCount).toBe(fresh.length + freshOverflow);
    expect(digest.closedCount).toBe(1);
    expect(digest.closedCount).toBe(recentlyClosed.length);
  });

  it("newCount includes the capped overflow (fresh.length + freshOverflow)", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      item({ id: `n${i}`, firstSeenAt: hoursAgo(i + 1) }),
    );
    const { digest, fresh, freshOverflow } = composeRadarFeed({
      items,
      sources: [],
      now: NOW,
      freshLimit: 2,
    });
    expect(fresh).toHaveLength(2);
    expect(freshOverflow).toBe(3);
    expect(digest.newCount).toBe(5);
    expect(digest.newCount).toBe(fresh.length + freshOverflow);
  });

  it("sourcesChecked counts enabled sources only (disabled are skipped by the sweep)", () => {
    const { digest } = composeRadarFeed({
      items: [],
      sources: [
        source({ employerName: "Live", enabled: true }),
        source({ employerName: "Watcher", enabled: true, watchOnly: true }),
        source({ employerName: "Off", enabled: false }),
      ],
      now: NOW,
    });
    expect(digest.sourcesChecked).toBe(2);
  });

  it("lastSyncAt mirrors coverage.lastSweepAt (same real timestamp, or null)", () => {
    const withFetch = composeRadarFeed({
      items: [],
      sources: [
        source({ employerName: "A", lastSuccessfulFetchAt: "2026-06-15T06:00:00.000Z" }),
        source({ employerName: "B", lastSuccessfulFetchAt: "2026-06-14T06:00:00.000Z" }),
      ],
      now: NOW,
    });
    expect(withFetch.digest.lastSyncAt).toBe("2026-06-15T06:00:00.000Z");
    expect(withFetch.digest.lastSyncAt).toBe(withFetch.coverage.lastSweepAt);

    const noFetch = composeRadarFeed({ items: [], sources: [], now: NOW });
    expect(noFetch.digest.lastSyncAt).toBeNull();
    expect(noFetch.digest.lastSyncAt).toBe(noFetch.coverage.lastSweepAt);
  });

  it("all-quiet digest is honest zeros", () => {
    const { digest } = composeRadarFeed({ items: [], sources: [], now: NOW });
    expect(digest).toEqual({
      sourcesChecked: 0,
      lastSyncAt: null,
      newCount: 0,
      closedCount: 0,
    });
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

  it("a single clean live source counts as 1 live feed with 0 needs-attention", () => {
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
  it("normalizes string and Date closedAt the same way", () => {
    const isoResult = composeRadarFeed({
      items: [
        item({
          id: "iso",
          status: "CLOSED" as OpportunityStatus,
          closedAt: daysFromNow(-2).toISOString(),
        }),
      ],
      sources: [],
      now: NOW,
    });
    const dateResult = composeRadarFeed({
      items: [
        item({ id: "date", status: "CLOSED" as OpportunityStatus, closedAt: daysFromNow(-2) }),
      ],
      sources: [],
      now: NOW,
    });
    expect(isoResult.recentlyClosed).toHaveLength(1);
    expect(dateResult.recentlyClosed).toHaveLength(1);
  });

  it("ignores unparseable dates without crashing", () => {
    const { fresh, recentlyClosed, digest } = composeRadarFeed({
      items: [
        item({ id: "bad", firstSeenAt: "garbage" as unknown as string }),
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
    expect(fresh).toEqual([]);
    expect(recentlyClosed).toEqual([]);
    expect(digest.newCount).toBe(0);
    expect(digest.closedCount).toBe(0);
    expect(digest.lastSyncAt).toBeNull();
  });
});
