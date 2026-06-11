import { describe, it, expect } from "vitest";
import { dockContextLabel, dockSuggestions } from "@/lib/dock-context";

describe("dockContextLabel", () => {
  const table: [string, string][] = [
    ["/tracker/abc", "SEES: LISTING"],
    ["/tracker", "SEES: TRACKER"],
    ["/applications", "SEES: APPLICATIONS"],
    ["/applications/123", "SEES: APPLICATIONS"],
    ["/memory", "SEES: MEMORY"],
    ["/radar", "SEES: RADAR"],
    ["/today", "SEES: TODAY"],
    ["/chat", "SEES: CHAT"],
    ["/settings", "SEES: APP"],
    ["/", "SEES: APP"],
    ["/some-unknown-route", "SEES: APP"],
  ];

  it.each(table)("%s → %s", (pathname, expected) => {
    expect(dockContextLabel(pathname)).toBe(expected);
  });
});

describe("dockSuggestions", () => {
  const surfaces = [
    "/tracker",
    "/tracker/abc",
    "/applications",
    "/memory",
    "/today",
    "/radar",
    "/chat",
    "/settings",
    "/",
  ];

  it.each(surfaces)("%s yields between 1 and 3 suggestions", (pathname) => {
    const s = dockSuggestions(pathname);
    expect(s.length).toBeGreaterThanOrEqual(1);
    expect(s.length).toBeLessThanOrEqual(3);
    for (const item of s) expect(typeof item).toBe("string");
  });

  it("is surface-specific for tracker", () => {
    expect(dockSuggestions("/tracker")).toContain(
      "What should I apply to first?",
    );
  });

  it("falls back to generic starters on unknown routes", () => {
    expect(dockSuggestions("/settings")).toContain("What needs my attention?");
  });
});
