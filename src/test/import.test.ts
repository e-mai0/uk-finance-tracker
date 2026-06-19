import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  buildPresentByCohort,
  importDataset,
} from "../ingestion/import";
import type { RawDataset } from "../ingestion/types";

describe("buildPresentByCohort", () => {
  it("keeps touched source cohorts even when no roles are present", () => {
    const cohorts = buildPresentByCohort(
      [],
      new Map([["Acme Capital", "emp_1"]]),
      [{ employerName: "Acme Capital", sourceType: "WORKDAY" }],
    );

    expect([...cohorts.keys()]).toEqual(["emp_1:WORKDAY"]);
    expect(cohorts.get("emp_1:WORKDAY")?.size).toBe(0);
  });
});

describe("importDataset close sweep", () => {
  it("advances absent debounce for a healthy empty source fetch", async () => {
    const now = new Date("2026-07-01T12:00:00Z");
    const dataset: RawDataset = {
      source: "workday:acme",
      employers: [{ name: "Acme Capital", sector: "Investment Bank" }],
      opportunities: [],
    };
    const updates: unknown[] = [];
    const mockPrisma = {
      ingestionRun: {
        create: vi.fn(async () => ({ id: "run_1" })),
        update: vi.fn(async () => ({})),
      },
      employer: {
        upsert: vi.fn(async () => ({ id: "emp_1" })),
      },
      opportunity: {
        findMany: vi.fn(async () => [
          {
            id: "opp_1",
            title: "Spring Insight Programme",
            location: "London",
            status: "OPEN",
            consecutiveMisses: 1,
            deadlineAt: null,
            deadlineEstimated: false,
          },
        ]),
        update: vi.fn(async (args) => {
          updates.push(args);
          return {};
        }),
      },
    };

    const result = await importDataset(
      mockPrisma as unknown as PrismaClient,
      dataset,
      now,
      {
        touchedCohorts: [
          { employerName: "Acme Capital", sourceType: "WORKDAY" },
        ],
      },
    );

    expect(result).toEqual({ created: 0, updated: 0, employers: 1 });
    expect(mockPrisma.opportunity.findMany).toHaveBeenCalledWith({
      where: { employerId: "emp_1", sourceType: "WORKDAY" },
      select: {
        id: true,
        title: true,
        location: true,
        status: true,
        consecutiveMisses: true,
        deadlineAt: true,
        deadlineEstimated: true,
      },
    });
    expect(updates).toEqual([
      {
        where: { id: "opp_1" },
        data: {
          status: "CLOSED",
          consecutiveMisses: 2,
          closedAt: now,
          closeReason: "absent_debounce",
        },
      },
    ]);
  });
});
