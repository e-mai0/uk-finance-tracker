import { describe, expect, it } from "vitest";
import { parseRetryAfter, isImpervaBlocked, backoffDelays } from "../ingestion/adapters/common";

describe("parseRetryAfter", () => {
  it("parses delay-seconds", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
  });
  it("returns null for missing/garbage", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("isImpervaBlocked", () => {
  it("detects an Incapsula interstitial body", () => {
    expect(isImpervaBlocked('<html>Request unsuccessful. Incapsula incident ID: 123</html>')).toBe(true);
  });
  it("passes clean HTML", () => {
    expect(isImpervaBlocked("<html><body><a href=/opp/1>Role</a></body></html>")).toBe(false);
  });
});

describe("backoffDelays", () => {
  it("produces an increasing capped schedule", () => {
    const d = backoffDelays(3, 500, 4000);
    expect(d).toHaveLength(3);
    expect(d[0]).toBe(500);
    expect(d[1]).toBe(1000);
    expect(d[2]).toBe(2000);
    expect(Math.max(...backoffDelays(10, 500, 4000))).toBeLessThanOrEqual(4000);
  });
});
