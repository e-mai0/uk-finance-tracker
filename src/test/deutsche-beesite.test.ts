import { describe, expect, it } from "vitest";
import { mapBeesite } from "../ingestion/adapters/deutsche-beesite";
import type { AdapterEmployer } from "../ingestion/adapters/common";

const db: AdapterEmployer = { name: "Deutsche Bank", sector: "Investment Bank" };

const PAYLOAD = { SearchResult: { SearchResultItems: [
  { MatchedObjectDescriptor: { PositionID: "73600", PositionTitle: "2026 Summer Internship - Investment Bank (London)",
      PositionLocation: [{ CountryCode: "GB", CityName: "London" }], PublicationEndDate: "2026-08-04", ApplyURI: ["https://db.recsolu.com/x"] } },
  { MatchedObjectDescriptor: { PositionID: "73601", PositionTitle: "2026 Summer Internship - Sydney",
      PositionLocation: [{ CountryCode: "AU", CityName: "Sydney" }], PublicationEndDate: "2099-12-31", ApplyURI: ["https://db.recsolu.com/y"] } },
]}};

describe("mapBeesite", () => {
  it("keeps GB internships with a real deadline", () => {
    const out = mapBeesite(PAYLOAD, db);
    expect(out).toHaveLength(1);
    expect(out[0].deadlineAt).toBe("2026-08-04");
    expect(out[0].sourceType).toBe("CAREERS_PAGE");
  });
  it("treats the 2099 sentinel as no deadline (will be inferred)", () => {
    const gbSentinel = { SearchResult: { SearchResultItems: [{ MatchedObjectDescriptor: {
      ...PAYLOAD.SearchResult.SearchResultItems[1].MatchedObjectDescriptor,
      PositionLocation: [{ CountryCode: "GB", CityName: "London" }], PositionTitle: "2026 Summer Internship - London" } }] } };
    const out = mapBeesite(gbSentinel, db);
    expect(out[0].deadlineAt).toBeUndefined();
  });
});
