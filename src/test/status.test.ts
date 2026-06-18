import { describe, expect, it } from "vitest";
import { decideTransitions, type ExistingRole } from "../ingestion/status";

const now = new Date("2026-07-01T00:00:00Z");

function role(p: Partial<ExistingRole> & { key: string }): ExistingRole {
  return {
    key: p.key,
    status: p.status ?? "OPEN",
    consecutiveMisses: p.consecutiveMisses ?? 0,
    deadlineAt: p.deadlineAt ?? null,
    deadlineEstimated: p.deadlineEstimated ?? false,
  };
}

describe("decideTransitions", () => {
  it("does nothing when the fetch was unhealthy", () => {
    const existing = [role({ key: "a" })];
    const out = decideTransitions(existing, new Set<string>(), false, now);
    expect(out).toEqual([]);
  });

  it("increments misses on first absence, no close yet", () => {
    const existing = [role({ key: "a" })];
    const out = decideTransitions(existing, new Set(["b"]), true, now);
    expect(out).toEqual([
      { key: "a", consecutiveMisses: 1, status: "OPEN" },
    ]);
  });

  it("closes after the second consecutive miss", () => {
    const existing = [role({ key: "a", consecutiveMisses: 1 })];
    const out = decideTransitions(existing, new Set(["b"]), true, now);
    expect(out[0]).toMatchObject({
      key: "a",
      status: "CLOSED",
      closeReason: "absent_debounce",
    });
  });

  it("resets misses and reopens a previously closed role that reappears", () => {
    const existing = [role({ key: "a", status: "CLOSED", consecutiveMisses: 2 })];
    const out = decideTransitions(existing, new Set(["a"]), true, now);
    expect(out[0]).toMatchObject({ key: "a", status: "OPEN", consecutiveMisses: 0 });
  });

  it("closes a present role whose REAL deadline has passed", () => {
    const past = new Date("2026-06-01T00:00:00Z");
    const existing = [role({ key: "a", deadlineAt: past, deadlineEstimated: false })];
    const out = decideTransitions(existing, new Set(["a"]), true, now);
    expect(out[0]).toMatchObject({ key: "a", status: "CLOSED", closeReason: "deadline_passed" });
  });

  it("does NOT close a present role during the published deadline day", () => {
    const endOfDeadlineDay = new Date("2026-07-01T23:59:59.999Z");
    const midday = new Date("2026-07-01T12:00:00Z");
    const existing = [role({ key: "a", deadlineAt: endOfDeadlineDay, deadlineEstimated: false })];
    const out = decideTransitions(existing, new Set(["a"]), true, midday);
    expect(out).toEqual([]);
  });

  it("does NOT close on a passed ESTIMATED deadline", () => {
    const past = new Date("2026-06-01T00:00:00Z");
    const existing = [role({ key: "a", deadlineAt: past, deadlineEstimated: true })];
    const out = decideTransitions(existing, new Set(["a"]), true, now);
    expect(out).toEqual([]); // present, estimated deadline → leave alone
  });
});
