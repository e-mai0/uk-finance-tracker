import { describe, expect, it } from "vitest";
import { mapGoldmanRoles } from "../ingestion/adapters/goldman-higher";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const gs: AdapterEmployer = { name: "Goldman Sachs", sector: "Investment Bank" };

const DATA = { data: { roleSearch: { totalCount: 2, items: [
  { roleId: "164510_GS_CAMPUS", jobTitle: "2026 Summer Analyst — Investment Banking", division: "Investment Banking",
    locations: [{ city: "London", country: "United Kingdom" }], externalSource: { sourceId: "164510" } },
  { roleId: "164511_GS_CAMPUS", jobTitle: "2026 Summer Analyst — Engineering", division: "Engineering",
    locations: [{ city: "New York", country: "United States" }], externalSource: { sourceId: "164511" } },
]}}};

describe("mapGoldmanRoles", () => {
  it("keeps UK campus roles and builds the /roles/<sourceId> URL", () => {
    const out = mapGoldmanRoles(DATA, gs);
    expect(out).toHaveLength(1);
    expect(out[0].applicationUrl).toBe("https://higher.gs.com/roles/164510");
    expect(out[0].sourceType).toBe("CAREERS_PAGE");
  });
});
