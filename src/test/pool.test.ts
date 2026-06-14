import { describe, expect, it } from "vitest";
import { mapPool } from "../ingestion/pool";

describe("mapPool", () => {
  it("runs every item and preserves input order in the results", async () => {
    const out = await mapPool([1, 2, 3, 4, 5], 2, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // actually ran concurrently
  });

  it("returns an empty array for empty input without running the worker", async () => {
    let calls = 0;
    const out = await mapPool([], 4, async () => {
      calls++;
      return 1;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it("passes the index to the worker", async () => {
    const out = await mapPool(["a", "b", "c"], 2, async (v, i) => `${i}:${v}`);
    expect(out).toEqual(["0:a", "1:b", "2:c"]);
  });
});
