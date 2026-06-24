import { describe, it, expect } from "vitest";
import { composeRadarFeed, type RadarFeedSource } from "../lib/radar-feed";
import type { TrackerItem } from "../lib/filters";
import type { OpportunityStatus, RoleFamily } from "@prisma/client";

/**
 * Independent (≠author) held-out review tests for composeRadarFeed.
 * Different anchor, different fixtures, different employer names than the
 * author's suite — verifies the load-bearing claims hold on inputs the author
 * never used, plus purity. Mutation probes (run separately by the reviewer)
 * confirm these reds fire.
 */

const T0 = new Date("2026-03-10T09:00:00.000Z");

function it_(over: Partial<TrackerItem> & { id: string }): TrackerItem {
  return {
    employerName: "Brevan Howard",
    employerSlug: "brevan-howard",
    title: "Off-Cycle Analyst",
    roleFamily: "MARKETS" as RoleFamily,
    programmeType: "OFF_CYCLE" as TrackerItem["programmeType"],
    location: "London",
    status: "OPEN" as OpportunityStatus,
    opensAt: null,
    deadlineAt: null,
    lastSeenAt: T0,
    firstSeenAt: T0,
    tags: [],
    deadlineEstimated: false,
    isRolling: false,
    closedAt: null,
    closeReason: null,
    ...over,
  };
}
const hAgo = (h: number) => new Date(T0.getTime() - h * 3_600_000);
const dOff = (d: number) => new Date(T0.getTime() + d * 86_400_000);
const src = (o: Partial<RadarFeedSource> & { employerName: string }): RadarFeedSource => ({
  enabled: true,
  watchOnly: false,
  lastStatus: "ok",
  lastChangedAt: null,
  lastSuccessfulFetchAt: null,
  ...o,
});

describe("radar-feed [review] isOvernight is a strict hour subset of the week window", () => {
  it("30h → fresh+overnight, 38h → fresh not overnight, 9d → not fresh", () => {
    const { fresh } = composeRadarFeed({
      items: [
        it_({ id: "h30", firstSeenAt: hAgo(30) }),
        it_({ id: "h38", firstSeenAt: hAgo(38) }),
        it_({ id: "d9", firstSeenAt: hAgo(9 * 24) }),
      ],
      sources: [],
      now: T0,
    });
    const by = new Map(fresh.map((f) => [f.id, f.isOvernight]));
    expect([...by.keys()].sort()).toEqual(["h30", "h38"]); // d9 excluded
    expect(by.get("h30")).toBe(true);
    expect(by.get("h38")).toBe(false);
  });
});

describe("radar-feed [review] closingSoon hygiene", () => {
  it("excludes estimated, rolling, past, and non-OPEN; orders soonest-first", () => {
    const { closingSoon } = composeRadarFeed({
      items: [
        it_({ id: "ok6", deadlineAt: dOff(6) }),
        it_({ id: "ok1", deadlineAt: dOff(1) }),
        it_({ id: "est", deadlineAt: dOff(2), deadlineEstimated: true }),
        it_({ id: "roll", deadlineAt: dOff(2), isRolling: true }),
        it_({ id: "past", deadlineAt: dOff(-2) }),
        it_({ id: "closedSoon", status: "CLOSED" as OpportunityStatus, deadlineAt: dOff(2) }),
      ],
      sources: [],
      now: T0,
    });
    expect(closingSoon.map((i) => i.id)).toEqual(["ok1", "ok6"]);
  });
});

describe("radar-feed [review] recentlyClosed window", () => {
  it("includes 2-days-ago, excludes 10-days-ago and null closedAt; desc by closedAt", () => {
    const { recentlyClosed } = composeRadarFeed({
      items: [
        it_({ id: "c2", status: "CLOSED" as OpportunityStatus, closedAt: dOff(-2) }),
        it_({ id: "c6", status: "CLOSED" as OpportunityStatus, closedAt: dOff(-6) }),
        it_({ id: "c10", status: "CLOSED" as OpportunityStatus, closedAt: dOff(-10) }),
        it_({ id: "cNull", status: "CLOSED" as OpportunityStatus, closedAt: null }),
      ],
      sources: [],
      now: T0,
    });
    expect(recentlyClosed.map((i) => i.id)).toEqual(["c2", "c6"]);
  });
});

describe("radar-feed [review] coverage.needsAttention", () => {
  it("counts disabled + unreachable + changed-watcher independently", () => {
    const { coverage } = composeRadarFeed({
      items: [],
      sources: [
        src({ employerName: "Live A", lastSuccessfulFetchAt: "2026-03-10T05:00:00.000Z" }),
        src({ employerName: "Disabled B", enabled: false }),
        src({ employerName: "Unreach C", lastStatus: "Unreachable: bot challenge" }),
        src({ employerName: "Changed W", watchOnly: true, lastChangedAt: "2026-03-09T00:00:00.000Z" }),
        src({ employerName: "Quiet W", watchOnly: true, lastChangedAt: null }),
      ],
      now: T0,
    });
    expect(coverage.liveFeeds).toBe(1);
    expect(coverage.watching).toBe(2);
    expect(coverage.needsAttention).toBe(3);
    expect(coverage.tracked).toBe(5);
    expect(coverage.lastSweepAt).toBe("2026-03-10T05:00:00.000Z");
  });
});

describe("radar-feed [review] cap + overflow on an oversized set", () => {
  it("caps to freshLimit=4, overflow=4, keeps newest", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      it_({ id: `n${i}`, firstSeenAt: hAgo(i * 6 + 1) }),
    );
    const { fresh, freshOverflow } = composeRadarFeed({
      items,
      sources: [],
      now: T0,
      freshLimit: 4,
    });
    expect(fresh.map((i) => i.id)).toEqual(["n0", "n1", "n2", "n3"]);
    expect(freshOverflow).toBe(4);
  });
});

describe("radar-feed [review] purity", () => {
  it("same now → identical output across two calls (no internal clock)", () => {
    const mk = () =>
      composeRadarFeed({
        items: [
          it_({ id: "a", firstSeenAt: hAgo(5), deadlineAt: dOff(3) }),
          it_({ id: "b", status: "CLOSED" as OpportunityStatus, closedAt: dOff(-1) }),
        ],
        sources: [src({ employerName: "S", lastSuccessfulFetchAt: "2026-03-10T01:00:00.000Z" })],
        now: T0,
      });
    expect(JSON.stringify(mk())).toEqual(JSON.stringify(mk()));
  });
});
