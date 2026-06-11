import { describe, expect, it } from "vitest";
import { detectSource, prettifyIdentifier } from "../lib/source-detect";

describe("detectSource", () => {
  it("detects classic and regional Greenhouse board URLs", () => {
    expect(detectSource("https://boards.greenhouse.io/janestreet")).toEqual({
      kind: "GREENHOUSE",
      identifier: "janestreet",
    });
    expect(
      detectSource("https://job-boards.eu.greenhouse.io/mangroup"),
    ).toEqual({ kind: "GREENHOUSE", identifier: "mangroup" });
    expect(
      detectSource("https://job-boards.greenhouse.io/point72/jobs/8183047002"),
    ).toEqual({ kind: "GREENHOUSE", identifier: "point72" });
  });

  it("detects Greenhouse embed URLs via the `for` param", () => {
    expect(
      detectSource("https://boards.greenhouse.io/embed/job_board?for=acmefund"),
    ).toEqual({ kind: "GREENHOUSE", identifier: "acmefund" });
  });

  it("detects Lever URLs including the EU host", () => {
    expect(detectSource("https://jobs.lever.co/wintermute-trading")).toEqual({
      kind: "LEVER",
      identifier: "wintermute-trading",
    });
    expect(detectSource("https://jobs.eu.lever.co/acme/123-456")).toEqual({
      kind: "LEVER",
      identifier: "acme",
    });
  });

  it("detects Ashby boards", () => {
    expect(detectSource("https://jobs.ashbyhq.com/quadrature")).toEqual({
      kind: "ASHBY",
      identifier: "quadrature",
    });
  });

  it("accepts bare URLs without a scheme", () => {
    expect(detectSource("jobs.ashbyhq.com/quadrature")).toEqual({
      kind: "ASHBY",
      identifier: "quadrature",
    });
  });

  it("recognises Workday tenants as unsupported", () => {
    expect(
      detectSource("https://ms.wd5.myworkdayjobs.com/External"),
    ).toEqual({ kind: "UNSUPPORTED", ats: "WORKDAY", identifier: "ms" });
  });

  it("returns null for unrecognised or malformed input", () => {
    expect(detectSource("https://www.goldmansachs.com/careers")).toBeNull();
    expect(detectSource("not a url at all %%%")).toBeNull();
    expect(detectSource("https://boards.greenhouse.io/")).toBeNull();
  });
});

describe("prettifyIdentifier", () => {
  it("turns board slugs into firm names", () => {
    expect(prettifyIdentifier("jane-street")).toBe("Jane Street");
    expect(prettifyIdentifier("wintermute_trading")).toBe("Wintermute Trading");
    expect(prettifyIdentifier("point72")).toBe("Point72");
  });
});
