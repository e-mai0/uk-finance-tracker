import { describe, expect, it } from "vitest";
import { liveSources, type LiveSource } from "../../prisma/sources";

/**
 * Registry-shape contract for prisma/sources.ts. These guard the invariants the
 * seed/sync pipeline relies on — every adapter decodes `config` by `kind`, so a
 * malformed or duplicated entry would silently break ingestion for that firm.
 * Reachability of each board is verified MANUALLY by the onboarding engineer
 * (no live-network calls here — they would be flaky in CI).
 */

function key(s: LiveSource): string {
  return `${s.kind}::${s.identifier}`;
}

describe("liveSources registry", () => {
  it("has a unique (kind, identifier) for every source", () => {
    const seen = new Map<string, number>();
    for (const s of liveSources) {
      seen.set(key(s), (seen.get(key(s)) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(dupes).toEqual([]);
  });

  it("uses unique employer names per source (one feed per firm)", () => {
    const names = liveSources.map((s) => s.employerName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("requires the core fields on every entry", () => {
    for (const s of liveSources) {
      expect(s.identifier, `identifier for ${s.employerName}`).toBeTruthy();
      expect(s.employerName, `employerName for ${key(s)}`).toBeTruthy();
      expect(s.url, `url for ${key(s)}`).toMatch(/^https?:\/\//);
      // url must be a parseable absolute URL
      expect(() => new URL(s.url)).not.toThrow();
    }
  });

  it("carries a well-formed config for each ATS that needs one", () => {
    for (const s of liveSources) {
      if (s.kind === "WORKDAY") {
        expect(s.config?.ats, key(s)).toBe("workday");
        const c = s.config as Extract<typeof s.config, { ats: "workday" }>;
        expect(c.host, key(s)).toBeTruthy();
        expect(c.tenant, key(s)).toBeTruthy();
        expect(c.site, key(s)).toBeTruthy();
        // the listing url must point at the configured Workday host
        expect(new URL(s.url).host, key(s)).toBe(c.host);
      }
      if (s.kind === "TALNET") {
        expect(s.config?.ats, key(s)).toBe("talnet");
        const c = s.config as Extract<typeof s.config, { ats: "talnet" }>;
        expect(c.host, key(s)).toBeTruthy();
        expect(Number.isInteger(c.board), key(s)).toBe(true);
        expect(new URL(s.url).host, key(s)).toBe(c.host);
      }
      if (s.kind === "SUCCESSFACTORS") {
        expect(s.config?.ats, key(s)).toBe("successfactors");
        const c = s.config as Extract<typeof s.config, { ats: "successfactors" }>;
        expect(c.host, key(s)).toBeTruthy();
        // listing url must point at the configured CSB host
        expect(new URL(s.url).host, key(s)).toBe(c.host);
      }
      if (s.kind === "SMARTRECRUITERS") {
        expect(s.config?.ats, key(s)).toBe("smartrecruiters");
        const c = s.config as Extract<typeof s.config, { ats: "smartrecruiters" }>;
        expect(c.company, key(s)).toBeTruthy();
      }
      if (s.kind === "GREENHOUSE") {
        // Greenhouse needs no config — the identifier IS the board token and the
        // adapter hits boards-api.greenhouse.io/{identifier} regardless of the
        // (display-only) job-boards host on the url.
        expect(s.config, key(s)).toBeUndefined();
        expect(s.identifier, key(s)).toMatch(/^[a-z0-9-]+$/);
        expect(s.url, key(s)).toMatch(/greenhouse\.io\//);
      }
    }
  });

  it("includes the Cycle-3d onboarded UK finance firms", () => {
    const byKey = new Map(liveSources.map((s) => [key(s), s]));

    // talnet — Bank of America campus board (board 1, verified 200 + opp tiles)
    const boa = byKey.get("TALNET::bofa-campus");
    expect(boa?.employerName).toBe("Bank of America");
    expect(boa?.config).toEqual({
      ats: "talnet",
      host: "bankcampuscareers.tal.net",
      board: 1,
    });

    // workday — Houlihan Lokey Campus + PJT Partners Students (early-careers sites)
    const hl = byKey.get("WORKDAY::houlihan-lokey-campus");
    expect(hl?.employerName).toBe("Houlihan Lokey");
    expect(hl?.config).toEqual({
      ats: "workday",
      host: "hl.wd1.myworkdayjobs.com",
      tenant: "hl",
      site: "Campus",
    });
    const pjt = byKey.get("WORKDAY::pjt-partners-students");
    expect(pjt?.config).toMatchObject({ tenant: "pjtpartners", site: "Students" });

    // greenhouse batch — board token is the identifier, no config
    const ghTokens = [
      "marshallwace",
      "imc",
      "drwuniversityjobs",
      "squarepointcapital",
      "quberesearchandtechnologies",
      "aqr",
      "exoduspoint",
      "schonfeld",
      "towerresearchcapital",
      "xtxmarketstechnologies",
      "mavensecuritiesholdingltd",
      "quadraturecapital",
      "aquaticcapitalmanagement",
      "jumptrading",
      "lincolninternational",
      "liontree",
      "williamblair",
      "eqtpartners",
      "permiraexternalprivate",
      "generalatlantic",
    ];
    for (const tok of ghTokens) {
      const s = byKey.get(`GREENHOUSE::${tok}`);
      expect(s, `greenhouse ${tok} present`).toBeDefined();
      expect(s?.config, `greenhouse ${tok} has no config`).toBeUndefined();
    }
  });

  it("includes the Greenhouse batch-2 prop/market-maker/quant firms", () => {
    const byKey = new Map(liveSources.map((s) => [key(s), s]));
    // Each board probed 200 with London/UK postings (2026-06-19). The bare `ctc`
    // token 404s; `chicagotrading` is the live CTC board.
    const batch2: Record<string, string> = {
      oldmissioncapital: "Old Mission Capital",
      virtu: "Virtu Financial",
      flowtraders: "Flow Traders",
      worldquant: "WorldQuant",
      akunacapital: "Akuna Capital",
      chicagotrading: "Chicago Trading Company",
    };
    for (const [tok, name] of Object.entries(batch2)) {
      const s = byKey.get(`GREENHOUSE::${tok}`);
      expect(s, `greenhouse ${tok} present`).toBeDefined();
      expect(s?.employerName, `greenhouse ${tok} name`).toBe(name);
      expect(s?.config, `greenhouse ${tok} has no config`).toBeUndefined();
      expect(s?.url, `greenhouse ${tok} url`).toMatch(/greenhouse\.io\//);
    }
  });

  it("tracks D. E. Shaw as a real CAREERS_PAGE feed (deshaw.com SSR blob)", () => {
    const byKey = new Map(liveSources.map((s) => [key(s), s]));
    const desco = byKey.get("CAREERS_PAGE::deshaw-careers-next");
    expect(desco, "D. E. Shaw present").toBeDefined();
    expect(desco?.employerName).toBe("D. E. Shaw");
    // a real tracked feed, not watch-only — the DeShawAdapter parses __NEXT_DATA__
    expect(desco?.watchOnly ?? false).toBe(false);
    expect(desco?.config, "deshaw needs no config").toBeUndefined();
    // hostname dispatch in sync.ts keys off deshaw.com
    expect(new URL(desco!.url).hostname.endsWith("deshaw.com")).toBe(true);
  });

  it("includes the Workday-bank + PDT onboarding batch (reused adapters)", () => {
    const byKey = new Map(liveSources.map((s) => [key(s), s]));

    // workday — NatWest (tenant rbs / site RBS), verified 200 + London/Edinburgh
    const natwest = byKey.get("WORKDAY::natwest-rbs");
    expect(natwest?.employerName).toBe("NatWest Group");
    expect(natwest?.config).toEqual({
      ats: "workday",
      host: "rbs.wd3.myworkdayjobs.com",
      tenant: "rbs",
      site: "RBS",
    });

    // workday — Lloyds Banking Group (tenant lbg / site LBG_Careers on wd3)
    const lloyds = byKey.get("WORKDAY::lloyds-lbg");
    expect(lloyds?.employerName).toBe("Lloyds Banking Group");
    expect(lloyds?.config).toEqual({
      ats: "workday",
      host: "lbg.wd3.myworkdayjobs.com",
      tenant: "lbg",
      site: "LBG_Careers",
    });

    // workday — Wellington Management (tenant wellington / site External on wd5)
    const wellington = byKey.get("WORKDAY::wellington-external");
    expect(wellington?.employerName).toBe("Wellington Management");
    expect(wellington?.config).toEqual({
      ats: "workday",
      host: "wellington.wd5.myworkdayjobs.com",
      tenant: "wellington",
      site: "External",
    });

    // greenhouse — PDT Partners (board token IS the identifier, no config)
    const pdt = byKey.get("GREENHOUSE::pdtpartners");
    expect(pdt?.employerName).toBe("PDT Partners");
    expect(pdt?.config, "pdt has no config").toBeUndefined();
    expect(pdt?.url, "pdt url").toMatch(/greenhouse\.io\//);
  });

  it("tracks Two Sigma as an Avature twosigma variant (OpenRoles SSR list)", () => {
    const byKey = new Map(liveSources.map((s) => [key(s), s]));
    const ts = byKey.get("AVATURE::twosigma");
    expect(ts, "Two Sigma present").toBeDefined();
    expect(ts?.employerName).toBe("Two Sigma");
    expect(ts?.config).toEqual({
      ats: "avature",
      variant: "twosigma",
      base: "https://careers.twosigma.com",
    });
    // listing url lives on the configured Avature base host
    const c = ts!.config as Extract<NonNullable<typeof ts>["config"], { ats: "avature" }>;
    expect(new URL(ts!.url).host).toBe(new URL(c.base).host);
  });

  it("watches Capula's reachable jobs.json as a CAREERS_PAGE radar row", () => {
    const byKey = new Map(liveSources.map((s) => [key(s), s]));
    const capula = byKey.get("CAREERS_PAGE::capula-jobs-json");
    expect(capula, "Capula present").toBeDefined();
    expect(capula?.employerName).toBe("Capula Investment Management");
    // honest watch-only: the feed is reachable (200) but empty off-season, so we
    // diff it for change rather than auto-publish a guessed schema.
    expect(capula?.watchOnly).toBe(true);
    expect(capula?.config, "watch-only needs no config").toBeUndefined();
  });
});
