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
    | "ORACLE_CLOUD" | "EIGHTFOLD" | "AVATURE" | "RADANCY" | "TALNET"
    | "SUCCESSFACTORS" | "SMARTRECRUITERS";
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
  // D. E. Shaw runs a custom Next.js careers app whose /careers page SERVER-
  // RENDERS the full opening list into its __NEXT_DATA__ blob (verified live
  // 2026-06-19: 200 + 14 internships incl. live London Trader/Analyst + Investor
  // Relations Summer-2027). The deshaw.com hostname dispatch routes to the
  // DeShawAdapter, which parses that SSR payload — no headless browser.
  { kind: "CAREERS_PAGE", identifier: "deshaw-careers-next", employerName: "D. E. Shaw", sector: "Hedge Fund",
    url: "https://www.deshaw.com/careers" },
  // --- Custom-ATS watchers (sitemap diffs / opaque JSON) — keep as watch-only ---
  { kind: "CAREERS_PAGE", identifier: "citadel-career-sitemap", employerName: "Citadel", sector: "Hedge Fund",
    url: "https://www.citadel.com/career-sitemap.xml", watchOnly: true },
  { kind: "CAREERS_PAGE", identifier: "citadel-securities-career-sitemap", employerName: "Citadel Securities", sector: "Market Maker",
    url: "https://www.citadelsecurities.com/career-sitemap.xml", watchOnly: true },
  // Capula's careers site is a custom Vue SPA backed by a public JSON feed at
  // /api/entries/jobs.json (verified live 2026-06-19: 200 + valid JSON, but
  // {"data":[]} — off-season, no live vacancies right now). Pinned as watchOnly:
  // the watch hash flags on /radar the moment a job posts, at which point a
  // future cycle can capture the real row shape and add a verified adapter (the
  // bundle exposes job.title / location{slug,label} / department / excerpt /
  // postDate, but with zero live rows the mapping can't yet be TDD-confirmed).
  { kind: "CAREERS_PAGE", identifier: "capula-jobs-json", employerName: "Capula Investment Management", sector: "Hedge Fund",
    url: "https://capula.com/api/entries/jobs.json", watchOnly: true },

  // ===================================================================
  // Cycle-3d onboarding — high-confidence UK finance firms that REUSE an
  // existing adapter (no new platform). Each board was manually probed with
  // the SAME URL shape the adapter uses and returned 200 + real postings
  // (greenhouse boards-api / workday CXS POST / tal.net job board HTML).
  // Live-network reachability is NOT asserted in CI (flaky) — see the
  // onboarding report for the per-firm HTTP evidence.
  // ===================================================================

  // --- Greenhouse quant / market-maker / HF batch (boards-api token = identifier) ---
  // All verified 200 on boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true
  // with London/UK postings present. classify.ts gates to UK early careers.
  { kind: "GREENHOUSE", identifier: "marshallwace", employerName: "Marshall Wace", sector: "Hedge Fund",
    url: "https://job-boards.greenhouse.io/marshallwace" },
  { kind: "GREENHOUSE", identifier: "imc", employerName: "IMC Trading", sector: "Market Maker",
    url: "https://job-boards.eu.greenhouse.io/imc" },
  { kind: "GREENHOUSE", identifier: "drwuniversityjobs", employerName: "DRW", sector: "Proprietary Trading",
    url: "https://job-boards.greenhouse.io/drwuniversityjobs" },
  { kind: "GREENHOUSE", identifier: "jumptrading", employerName: "Jump Trading", sector: "Proprietary Trading",
    url: "https://job-boards.greenhouse.io/jumptrading" },
  { kind: "GREENHOUSE", identifier: "squarepointcapital", employerName: "Squarepoint Capital", sector: "Hedge Fund",
    url: "https://job-boards.greenhouse.io/squarepointcapital" },
  { kind: "GREENHOUSE", identifier: "quberesearchandtechnologies", employerName: "Qube Research & Technologies", sector: "Hedge Fund",
    url: "https://job-boards.greenhouse.io/quberesearchandtechnologies" },
  { kind: "GREENHOUSE", identifier: "aqr", employerName: "AQR Capital Management", sector: "Hedge Fund",
    url: "https://job-boards.greenhouse.io/aqr" },
  { kind: "GREENHOUSE", identifier: "exoduspoint", employerName: "ExodusPoint Capital", sector: "Hedge Fund",
    url: "https://job-boards.greenhouse.io/exoduspoint" },
  { kind: "GREENHOUSE", identifier: "schonfeld", employerName: "Schonfeld Strategic Advisors", sector: "Hedge Fund",
    url: "https://job-boards.greenhouse.io/schonfeld" },
  { kind: "GREENHOUSE", identifier: "towerresearchcapital", employerName: "Tower Research Capital", sector: "Proprietary Trading",
    url: "https://job-boards.greenhouse.io/towerresearchcapital" },
  { kind: "GREENHOUSE", identifier: "xtxmarketstechnologies", employerName: "XTX Markets", sector: "Market Maker",
    url: "https://job-boards.greenhouse.io/xtxmarketstechnologies" },
  { kind: "GREENHOUSE", identifier: "mavensecuritiesholdingltd", employerName: "Maven Securities", sector: "Proprietary Trading",
    url: "https://job-boards.greenhouse.io/mavensecuritiesholdingltd" },
  { kind: "GREENHOUSE", identifier: "quadraturecapital", employerName: "Quadrature Capital", sector: "Hedge Fund",
    url: "https://job-boards.greenhouse.io/quadraturecapital" },
  { kind: "GREENHOUSE", identifier: "aquaticcapitalmanagement", employerName: "Aquatic Capital Management", sector: "Hedge Fund",
    url: "https://job-boards.greenhouse.io/aquaticcapitalmanagement" },
  // --- Greenhouse elite boutiques / PE (EU instance for EQT/Permira) ---
  { kind: "GREENHOUSE", identifier: "lincolninternational", employerName: "Lincoln International", sector: "Investment Bank",
    url: "https://job-boards.greenhouse.io/lincolninternational" },
  { kind: "GREENHOUSE", identifier: "liontree", employerName: "LionTree", sector: "Investment Bank",
    url: "https://job-boards.greenhouse.io/liontree" },
  { kind: "GREENHOUSE", identifier: "williamblair", employerName: "William Blair", sector: "Investment Bank",
    url: "https://job-boards.greenhouse.io/williamblair" },
  { kind: "GREENHOUSE", identifier: "eqtpartners", employerName: "EQT", sector: "Private Equity",
    url: "https://job-boards.eu.greenhouse.io/eqtpartners" },
  { kind: "GREENHOUSE", identifier: "permiraexternalprivate", employerName: "Permira", sector: "Private Equity",
    url: "https://job-boards.eu.greenhouse.io/permiraexternalprivate" },
  { kind: "GREENHOUSE", identifier: "generalatlantic", employerName: "General Atlantic", sector: "Private Equity",
    url: "https://job-boards.greenhouse.io/generalatlantic" },

  // --- Greenhouse batch 2: prop-trading / market-maker / quant HFs ---
  // All verified 200 on boards-api.greenhouse.io/v1/boards/<token>/jobs with
  // London/UK postings present (probed 2026-06-19). classify.ts gates each board
  // down to UK early-careers roles. No config — identifier IS the board token.
  //   · oldmissioncapital: 200, 93 jobs, live London grad quant-trader role
  //   · virtu:             200, 37 jobs, UK mentions
  //   · flowtraders:       200, 192 jobs, UK mentions
  //   · worldquant:        200, 102 jobs, London roles
  //   · akunacapital:      200, 168 jobs, "London, England, United Kingdom"
  //   · chicagotrading:    200, 56 jobs, "London, England, United Kingdom" (CTC;
  //     the bare `ctc` token 404s — chicagotrading is the live board)
  { kind: "GREENHOUSE", identifier: "oldmissioncapital", employerName: "Old Mission Capital", sector: "Proprietary Trading",
    url: "https://job-boards.greenhouse.io/oldmissioncapital" },
  { kind: "GREENHOUSE", identifier: "virtu", employerName: "Virtu Financial", sector: "Market Maker",
    url: "https://job-boards.greenhouse.io/virtu" },
  { kind: "GREENHOUSE", identifier: "flowtraders", employerName: "Flow Traders", sector: "Market Maker",
    url: "https://job-boards.greenhouse.io/flowtraders" },
  { kind: "GREENHOUSE", identifier: "worldquant", employerName: "WorldQuant", sector: "Hedge Fund",
    url: "https://job-boards.greenhouse.io/worldquant" },
  { kind: "GREENHOUSE", identifier: "akunacapital", employerName: "Akuna Capital", sector: "Proprietary Trading",
    url: "https://job-boards.greenhouse.io/akunacapital" },
  { kind: "GREENHOUSE", identifier: "chicagotrading", employerName: "Chicago Trading Company", sector: "Proprietary Trading",
    url: "https://job-boards.greenhouse.io/chicagotrading" },

  // --- tal.net campus boards (board number AUDITED against the live board) ---
  // Bank of America campus apply is bankcampuscareers.tal.net; board 1 is the
  // live campus/early-careers board (verified 16 opp tiles, candidate-opp-tile
  // layout the talnet adapter parses). Board 2 is empty; board 3 redirects.
  { kind: "TALNET", identifier: "bofa-campus", employerName: "Bank of America", sector: "Investment Bank",
    url: "https://bankcampuscareers.tal.net/candidate/jobboard/vacancy/1/adv/",
    config: { ats: "talnet", host: "bankcampuscareers.tal.net", board: 1 } },

  // --- Workday CXS — dedicated EARLY-CAREERS sites only ---
  // Houlihan Lokey `Campus` carries live UK off-cycle/graduate analyst roles.
  // PJT Partners `Students` is the campus board (currently off-season/empty,
  // like Lazard/Optiver) — pinned here rather than the experienced `Careers`.
  { kind: "WORKDAY", identifier: "houlihan-lokey-campus", employerName: "Houlihan Lokey", sector: "Investment Bank",
    url: "https://hl.wd1.myworkdayjobs.com/Campus",
    config: { ats: "workday", host: "hl.wd1.myworkdayjobs.com", tenant: "hl", site: "Campus" } },
  { kind: "WORKDAY", identifier: "pjt-partners-students", employerName: "PJT Partners", sector: "Investment Bank",
    url: "https://pjtpartners.wd1.myworkdayjobs.com/Students",
    config: { ats: "workday", host: "pjtpartners.wd1.myworkdayjobs.com", tenant: "pjtpartners", site: "Students" } },

  // --- SAP SuccessFactors Career Site Builder (server-rendered job tiles at
  //     /tile-search-results/?q=&startrow=N; the legacy career?company= RCM
  //     portal is JS-only and unusable — pin the CSB host). Endpoints + tile
  //     layout verified live (Jun 18); off-season now, so most rows are
  //     full-time and correctly excluded until early-careers roles post. ---
  { kind: "SUCCESSFACTORS", identifier: "janus-henderson", employerName: "Janus Henderson", sector: "Asset Manager",
    url: "https://jobs.janushenderson.com/",
    config: { ats: "successfactors", host: "jobs.janushenderson.com" } },
  { kind: "SUCCESSFACTORS", identifier: "mizuho-emea", employerName: "Mizuho", sector: "Investment Bank",
    url: "https://careers.mizuhoemea.com/",
    config: { ats: "successfactors", host: "careers.mizuhoemea.com" } },
  { kind: "SUCCESSFACTORS", identifier: "partners-group", employerName: "Partners Group", sector: "Private Markets",
    url: "https://jobs.partnersgroup.com/",
    config: { ats: "successfactors", host: "jobs.partnersgroup.com" } },
  { kind: "SUCCESSFACTORS", identifier: "swiss-re", employerName: "Swiss Re", sector: "Insurance",
    url: "https://careers.swissre.com/",
    config: { ats: "successfactors", host: "careers.swissre.com" } },

  // --- SmartRecruiters public Posting API
  //     (api.smartrecruiters.com/v1/companies/{company}/postings). SG identifier
  //     confirmed `SocieteGenerale4` (200 + valid empty content off-season). ---
  { kind: "SMARTRECRUITERS", identifier: "societe-generale", employerName: "Societe Generale", sector: "Investment Bank",
    url: "https://careers.smartrecruiters.com/SocieteGenerale4",
    config: { ats: "smartrecruiters", company: "SocieteGenerale4" } },
  { kind: "SMARTRECRUITERS", identifier: "legal-and-general", employerName: "Legal & General", sector: "Insurance Asset Manager",
    url: "https://jobs.smartrecruiters.com/LegalAndGeneral",
    config: { ats: "smartrecruiters", company: "LegalAndGeneral" } },
  { kind: "SMARTRECRUITERS", identifier: "mufg-investor-services", employerName: "MUFG Investor Services", sector: "Asset Servicing",
    url: "https://jobs.smartrecruiters.com/MUFGInvestorServices",
    config: { ats: "smartrecruiters", company: "MUFGInvestorServices" } },
  { kind: "SMARTRECRUITERS", identifier: "evelyn-partners", employerName: "Evelyn Partners", sector: "Wealth Manager",
    url: "https://jobs.smartrecruiters.com/EvelynPartners",
    config: { ats: "smartrecruiters", company: "EvelynPartners" } },
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
