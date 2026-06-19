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
});
