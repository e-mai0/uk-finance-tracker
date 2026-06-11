import { describe, expect, it } from "vitest";
import {
  evaluateWatch,
  extractSitemapLocs,
  isSitemapXml,
  normalizeHtmlForHash,
} from "../ingestion/watch";

const SITEMAP = (urls: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((u) => `<url><loc>${u}</loc></url>`)
    .join("")}</urlset>`;

describe("isSitemapXml / extractSitemapLocs", () => {
  it("recognises urlset and sitemapindex documents", () => {
    expect(isSitemapXml(SITEMAP(["https://x.com/a"]))).toBe(true);
    expect(isSitemapXml("<sitemapindex><sitemap></sitemap></sitemapindex>")).toBe(
      true,
    );
    expect(isSitemapXml("<!doctype html><html><body>jobs</body></html>")).toBe(
      false,
    );
  });

  it("extracts, dedupes and sorts loc URLs", () => {
    const xml = SITEMAP([
      "https://x.com/careers/b/",
      "https://x.com/careers/a/",
      "https://x.com/careers/b/",
    ]);
    expect(extractSitemapLocs(xml)).toEqual([
      "https://x.com/careers/a/",
      "https://x.com/careers/b/",
    ]);
  });
});

describe("normalizeHtmlForHash", () => {
  it("ignores script/style churn and whitespace", () => {
    const a = `<html><script>var build="abc123";</script><body>  Open roles </body></html>`;
    const b = `<html><script>var build="zzz999";</script><body>Open   roles</body></html>`;
    expect(normalizeHtmlForHash(a)).toBe(normalizeHtmlForHash(b));
  });

  it("still detects real content changes", () => {
    const a = `<body>Open roles: 3</body>`;
    const b = `<body>Open roles: 4</body>`;
    expect(normalizeHtmlForHash(a)).not.toBe(normalizeHtmlForHash(b));
  });
});

describe("evaluateWatch — sitemap strategy", () => {
  const first = SITEMAP(["https://x.com/careers/a/", "https://x.com/careers/b/"]);

  it("captures a baseline on the first run without flagging change", () => {
    const out = evaluateWatch(null, first);
    expect(out.changed).toBe(false);
    expect(out.state).toEqual({
      kind: "sitemap",
      urls: ["https://x.com/careers/a/", "https://x.com/careers/b/"],
    });
  });

  it("reports no change when the URL set is stable", () => {
    const base = evaluateWatch(null, first);
    const out = evaluateWatch(base.state, first);
    expect(out.changed).toBe(false);
  });

  it("flags new role URLs and lists them", () => {
    const base = evaluateWatch(null, first);
    const next = SITEMAP([
      "https://x.com/careers/a/",
      "https://x.com/careers/b/",
      "https://x.com/careers/summer-intern-london/",
    ]);
    const out = evaluateWatch(base.state, next);
    expect(out.changed).toBe(true);
    expect(out.newUrls).toEqual(["https://x.com/careers/summer-intern-london/"]);
    expect(out.summary).toContain("1 new");
  });

  it("flags removals (closings) too", () => {
    const base = evaluateWatch(null, first);
    const out = evaluateWatch(base.state, SITEMAP(["https://x.com/careers/a/"]));
    expect(out.changed).toBe(true);
    expect(out.summary).toContain("1 removed");
    expect(out.newUrls).toEqual([]);
  });
});

describe("evaluateWatch — page-hash strategy", () => {
  it("baselines, then flags only real content changes", () => {
    const page = `<html><script>nonce=1</script><body>Roles: A, B</body></html>`;
    const base = evaluateWatch(null, page);
    expect(base.changed).toBe(false);
    expect(base.state.kind).toBe("page");

    const sameContent = `<html><script>nonce=2</script><body>Roles: A, B</body></html>`;
    expect(evaluateWatch(base.state, sameContent).changed).toBe(false);

    const newRole = `<html><body>Roles: A, B, C</body></html>`;
    const out = evaluateWatch(base.state, newRole);
    expect(out.changed).toBe(true);
    expect(out.summary).toContain("changed");
  });

  it("re-baselines without flagging when the strategy switches", () => {
    const base = evaluateWatch(null, "<body>page</body>");
    const out = evaluateWatch(base.state, SITEMAP(["https://x.com/a"]));
    expect(out.changed).toBe(false);
    expect(out.state.kind).toBe("sitemap");
  });
});
