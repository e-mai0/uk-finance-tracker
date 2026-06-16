import { Prisma, type PrismaClient } from "@prisma/client";
import type { SourceConfig } from "../src/ingestion/types";

/**
 * The live ingestion-source registry, shared by the full seed (`prisma/seed.ts`)
 * and the prod-safe bootstrap (`scripts/seed-and-sync.ts`). One row per firm.
 *
 * Sources verified against src/ingestion/source-plans/uk-finance-2027.json and
 * live probes. ATS boards + custom feeds publish automatically; watchOnly rows
 * are custom-ATS sites we diff for change and flag on /radar. Dual-ATS firms are
 * deduped to one feed (Citi→Eightfold, Barclays→Workday, Man Group→Greenhouse).
 * The long tail of boutique firms enters via Firm Scout rather than this seed.
 */
export interface LiveSource {
  kind:
    | "GREENHOUSE" | "CAREERS_PAGE" | "WORKDAY"
    | "ORACLE_CLOUD" | "EIGHTFOLD" | "AVATURE" | "RADANCY" | "TALNET";
  identifier: string;
  employerName: string;
  sector?: string;
  url: string;
  watchOnly?: boolean;
  config?: SourceConfig;
}

export const liveSources: LiveSource[] = [
  // --- Greenhouse (official API) ---
  { kind: "GREENHOUSE", identifier: "mangroup", employerName: "Man Group", sector: "Hedge Fund",
    url: "https://job-boards.eu.greenhouse.io/mangroup" },
  { kind: "GREENHOUSE", identifier: "point72", employerName: "Point72", sector: "Hedge Fund",
    url: "https://job-boards.greenhouse.io/point72" },
  // --- Jane Street (own public JSON feed; CAREERS_PAGE hostname dispatch) ---
  { kind: "CAREERS_PAGE", identifier: "janestreet-jobs-json", employerName: "Jane Street", sector: "Proprietary Trading",
    url: "https://www.janestreet.com/jobs/main.json" },
  // --- Workday CXS ---
  { kind: "WORKDAY", identifier: "ms-external", employerName: "Morgan Stanley", sector: "Investment Bank",
    url: "https://ms.wd5.myworkdayjobs.com/External",
    config: { ats: "workday", host: "ms.wd5.myworkdayjobs.com", tenant: "ms", site: "External" } },
  { kind: "WORKDAY", identifier: "barclays-external", employerName: "Barclays", sector: "Investment Bank",
    url: "https://barclays.wd3.myworkdayjobs.com/External_Career_Site_Barclays",
    config: { ats: "workday", host: "barclays.wd3.myworkdayjobs.com", tenant: "barclays", site: "External_Career_Site_Barclays" } },
  { kind: "WORKDAY", identifier: "blackstone-campus", employerName: "Blackstone", sector: "Private Equity",
    url: "https://blackstone.wd1.myworkdayjobs.com/Blackstone_Campus_Careers",
    config: { ats: "workday", host: "blackstone.wd1.myworkdayjobs.com", tenant: "blackstone", site: "Blackstone_Campus_Careers" } },
  // --- Oracle Cloud CE (real deadlines) ---
  { kind: "ORACLE_CLOUD", identifier: "jpmc-cx1001", employerName: "J.P. Morgan", sector: "Investment Bank",
    url: "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001",
    config: { ats: "oracle", host: "jpmc.fa.oraclecloud.com", site: "CX_1001" } },
  { kind: "ORACLE_CLOUD", identifier: "schroders-cx2", employerName: "Schroders", sector: "Asset Management",
    url: "https://ekbq.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2",
    config: { ats: "oracle", host: "ekbq.fa.em2.oraclecloud.com", site: "CX_2" } },
  // --- Eightfold ---
  { kind: "EIGHTFOLD", identifier: "hsbc", employerName: "HSBC", sector: "Investment Bank",
    url: "https://hsbc.eightfold.ai/careers",
    config: { ats: "eightfold", host: "hsbc.eightfold.ai", domain: "hsbc.com", endpoint: "apply" } },
  { kind: "EIGHTFOLD", identifier: "citi", employerName: "Citi", sector: "Investment Bank",
    url: "https://citi.eightfold.ai/careers",
    config: { ats: "eightfold", host: "citi.eightfold.ai", domain: "citi.com", endpoint: "pcsx" } },
  // --- Radancy / TalentBrew ---
  { kind: "RADANCY", identifier: "blackrock", employerName: "BlackRock", sector: "Asset Management",
    url: "https://careers.blackrock.com",
    config: { ats: "radancy", base: "https://careers.blackrock.com" } },
  // --- tal.net public job boards (6 confirmed boutiques; real inline deadlines) ---
  // Board numbers AUDITED & verified correct 2026-06-16 (campus/early-careers
  // boards). Do NOT "fix" these by chasing a bigger board — verified traps:
  //   · Evercore board 3 has ~30 roles but they are EXPERIENCED hires (VP/MD);
  //     board 2 is the campus/intern board. Bigger ≠ right.
  //   · Nomura board 2 is networking EVENTS ("Women in Banking"); board 1 is roles.
  //   · A board returning 200 with zero listings (e.g. Lazard) is SEASONAL
  //     ("no active opportunities"), not a wrong number — recheck when the next
  //     cycle opens. Closed roles still resolve by direct URL but are correctly
  //     absent from the active listing, so don't treat their absence as a gap.
  { kind: "TALNET", identifier: "nomura", employerName: "Nomura", sector: "Investment Bank",
    url: "https://nomuracampus.tal.net/candidate/jobboard/vacancy/1/adv/",
    config: { ats: "talnet", host: "nomuracampus.tal.net", board: 1 } },
  { kind: "TALNET", identifier: "jefferies", employerName: "Jefferies", sector: "Investment Bank",
    url: "https://jefferies.tal.net/candidate/jobboard/vacancy/2/adv/",
    config: { ats: "talnet", host: "jefferies.tal.net", board: 2 } },
  { kind: "TALNET", identifier: "rothschild", employerName: "Rothschild & Co", sector: "Investment Bank",
    url: "https://rothschildandco.tal.net/candidate/jobboard/vacancy/2/adv/",
    config: { ats: "talnet", host: "rothschildandco.tal.net", board: 2 } },
  { kind: "TALNET", identifier: "evercore", employerName: "Evercore", sector: "Investment Bank",
    url: "https://evercore.tal.net/candidate/jobboard/vacancy/2/adv/",
    config: { ats: "talnet", host: "evercore.tal.net", board: 2 } },
  { kind: "TALNET", identifier: "lazard", employerName: "Lazard", sector: "Investment Bank",
    url: "https://lazard-careers.tal.net/candidate/jobboard/vacancy/2/adv/",
    config: { ats: "talnet", host: "lazard-careers.tal.net", board: 2 } },
  { kind: "TALNET", identifier: "fidelity-intl", employerName: "Fidelity International", sector: "Asset Management",
    url: "https://fidelityinternational.tal.net/candidate/jobboard/vacancy/1/adv/",
    config: { ats: "talnet", host: "fidelityinternational.tal.net", board: 1 } },
  // --- Avature ---
  { kind: "AVATURE", identifier: "ubs-5131", employerName: "UBS", sector: "Investment Bank",
    url: "https://jobs.ubs.com/TGnewUI/Search/Home/Home?partnerid=25008&siteid=5131",
    config: { ats: "avature", variant: "ubs", base: "https://jobs.ubs.com", siteid: "5131" } },
  { kind: "AVATURE", identifier: "macquarie", employerName: "Macquarie", sector: "Investment Bank",
    url: "https://recruitment.macquarie.com/en_US/careers/SearchJobs",
    config: { ats: "avature", variant: "macquarie", base: "https://recruitment.macquarie.com" } },
  // --- Bespoke SPAs via CAREERS_PAGE hostname dispatch ---
  { kind: "CAREERS_PAGE", identifier: "goldman-higher-gs", employerName: "Goldman Sachs", sector: "Investment Bank",
    url: "https://higher.gs.com/" },
  { kind: "CAREERS_PAGE", identifier: "deutsche-bank-careers", employerName: "Deutsche Bank", sector: "Investment Bank",
    url: "https://careers.db.com/students-graduates/search-programmes/index?language_id=1" },
  // --- Custom-ATS watchers (sitemap diffs) — keep as watch-only ---
  { kind: "CAREERS_PAGE", identifier: "citadel-career-sitemap", employerName: "Citadel", sector: "Hedge Fund",
    url: "https://www.citadel.com/career-sitemap.xml", watchOnly: true },
  { kind: "CAREERS_PAGE", identifier: "citadel-securities-career-sitemap", employerName: "Citadel Securities", sector: "Market Maker",
    url: "https://www.citadelsecurities.com/career-sitemap.xml", watchOnly: true },
];

/** Idempotent upsert of every live source. Safe to run repeatedly and against
 *  prod — touches only the IngestionSource registry, no user/demo data. */
export async function registerSources(prisma: PrismaClient): Promise<number> {
  for (const s of liveSources) {
    await prisma.ingestionSource.upsert({
      where: { kind_identifier: { kind: s.kind, identifier: s.identifier } },
      update: {
        employerName: s.employerName,
        sector: s.sector ?? null,
        url: s.url,
        watchOnly: s.watchOnly ?? false,
        config: s.config ?? Prisma.JsonNull,
      },
      create: {
        kind: s.kind,
        identifier: s.identifier,
        employerName: s.employerName,
        sector: s.sector ?? null,
        url: s.url,
        watchOnly: s.watchOnly ?? false,
        config: s.config ?? Prisma.JsonNull,
      },
    });
  }
  return liveSources.length;
}
