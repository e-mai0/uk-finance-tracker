import type { RawDataset, RawEmployer, RawOpportunity } from "../types";

/**
 * Curated starter dataset of UK finance summer internships for the 2027 cycle
 * (applications open autumn 2026). All summaries are ORIGINAL, normalized
 * descriptions written for this product — no content is copied from employer
 * sites or third-party trackers. Apply/source URLs point at employers' own
 * early-careers landing pages.
 *
 * Dates use the 2027 cycle: most programmes open Aug–Oct 2026; a handful of
 * early-opening buy-side/quant firms are already open as of mid-2026, and a
 * few early closers are already shut.
 */

const employers: RawEmployer[] = [
  { name: "Goldman Sachs", sector: "Investment Bank", hq: "London", website: "https://www.goldmansachs.com/careers/students/", logoHint: "GS" },
  { name: "Morgan Stanley", sector: "Investment Bank", hq: "London", website: "https://www.morganstanley.com/careers", logoHint: "MS" },
  { name: "J.P. Morgan", sector: "Investment Bank", hq: "London", website: "https://careers.jpmorgan.com/global/en/students", logoHint: "JP" },
  { name: "Bank of America", sector: "Investment Bank", hq: "London", website: "https://campus.bankofamerica.com/", logoHint: "BA" },
  { name: "Citi", sector: "Investment Bank", hq: "London", website: "https://www.citigroup.com/global/early-careers", logoHint: "Ci" },
  { name: "Barclays", sector: "Investment Bank", hq: "London", website: "https://search.jobs.barclays/early-careers", logoHint: "Ba" },
  { name: "UBS", sector: "Investment Bank", hq: "London", website: "https://www.ubs.com/global/en/careers/students.html", logoHint: "UB" },
  { name: "Deutsche Bank", sector: "Investment Bank", hq: "London", website: "https://careers.db.com/students/", logoHint: "DB" },
  { name: "HSBC", sector: "Universal Bank", hq: "London", website: "https://www.hsbc.com/careers/students-and-graduates", logoHint: "HS" },
  { name: "Nomura", sector: "Investment Bank", hq: "London", website: "https://www.nomura.com/careers/", logoHint: "No" },
  { name: "Jefferies", sector: "Investment Bank", hq: "London", website: "https://www.jefferies.com/careers/", logoHint: "Je" },
  { name: "Rothschild & Co", sector: "Advisory", hq: "London", website: "https://www.rothschildandco.com/en/careers/", logoHint: "Ro" },
  { name: "Evercore", sector: "Advisory", hq: "London", website: "https://www.evercore.com/careers/", logoHint: "Ev" },
  { name: "Lazard", sector: "Advisory & Asset Management", hq: "London", website: "https://www.lazard.com/careers/", logoHint: "La" },
  { name: "BlackRock", sector: "Asset Management", hq: "London", website: "https://careers.blackrock.com/early-careers/", logoHint: "BR" },
  { name: "Schroders", sector: "Asset Management", hq: "London", website: "https://www.schroders.com/en/careers/early-careers/", logoHint: "Sc" },
  { name: "Fidelity International", sector: "Asset Management", hq: "London", website: "https://careers.fidelityinternational.com/early-careers", logoHint: "Fi" },
  { name: "Citadel", sector: "Hedge Fund", hq: "London", website: "https://www.citadel.com/careers/students/", logoHint: "Ct" },
  { name: "Citadel Securities", sector: "Market Maker", hq: "London", website: "https://www.citadelsecurities.com/careers/students/", logoHint: "CS" },
  { name: "Jane Street", sector: "Proprietary Trading", hq: "London", website: "https://www.janestreet.com/join-jane-street/", logoHint: "JS" },
  { name: "Point72", sector: "Hedge Fund", hq: "London", website: "https://careers.point72.com/", logoHint: "P72" },
  { name: "Man Group", sector: "Hedge Fund", hq: "London", website: "https://www.man.com/early-careers", logoHint: "Mn" },
  { name: "Blackstone", sector: "Private Equity", hq: "London", website: "https://www.blackstone.com/careers/students/", logoHint: "Bx" },
  { name: "Macquarie", sector: "Investment Bank", hq: "London", website: "https://www.macquarie.com/uk/en/about/careers.html", logoHint: "Mq" },
];

const SPONSOR_YES = "Visa sponsorship is typically available for summer interns.";
const SPONSOR_NO = "This employer states it cannot offer visa sponsorship for internships — you must have the right to work in the UK.";
const SPONSOR_CASE = "Sponsorship is considered case-by-case; confirm with the recruiting team.";

const opportunities: RawOpportunity[] = [
  // --- Goldman Sachs -------------------------------------------------------
  {
    employer: "Goldman Sachs", title: "Investment Banking Summer Analyst", roleFamily: "IB",
    divisionDesk: "Investment Banking Division", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-01", deadlineAt: null, firstSeen: "2026-05-22", lastSeen: "2026-06-04",
    summary: "Ten-week programme across coverage and product teams, supporting live M&A and financing mandates with valuation, modelling and client materials.",
    eligibilityNotes: "Open to penultimate-year undergraduates and final-year students from any discipline.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.goldmansachs.com/careers/students/programs/",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "valuation", "modelling", "excel"],
  },
  {
    employer: "Goldman Sachs", title: "Global Markets Summer Analyst", roleFamily: "MARKETS",
    divisionDesk: "Global Banking & Markets", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-01", deadlineAt: null, firstSeen: "2026-05-22", lastSeen: "2026-06-04",
    summary: "Rotational exposure to sales, trading and structuring desks across equities and fixed income, with daily desk work and a markets training curriculum.",
    eligibilityNotes: "Penultimate-year students preferred; strong quantitative aptitude expected.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.goldmansachs.com/careers/students/programs/",
    sourceType: "CAREERS_PAGE", tags: ["equities", "fixed income", "trading", "probability"],
  },
  {
    employer: "Goldman Sachs", title: "Asset & Wealth Management Summer Analyst", roleFamily: "ASSET_MGMT",
    divisionDesk: "Asset & Wealth Management", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-01", deadlineAt: null, firstSeen: "2026-05-28", lastSeen: "2026-06-04",
    summary: "Work alongside portfolio management, research and client teams across public and private markets investing.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.goldmansachs.com/careers/students/programs/",
    sourceType: "CAREERS_PAGE", tags: ["portfolio", "research", "investing"],
  },

  // --- Morgan Stanley ------------------------------------------------------
  {
    employer: "Morgan Stanley", title: "Investment Banking Summer Analyst", roleFamily: "IB",
    divisionDesk: "Investment Banking Division", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-15", deadlineAt: null, firstSeen: "2026-05-24", lastSeen: "2026-06-03",
    summary: "Support sector and product bankers on M&A, equity and debt financing, building models and pitch materials over a ten-week placement.",
    eligibilityNotes: "Penultimate-year undergraduates and master's students welcome.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.morganstanley.com/careers/students-graduates",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "valuation", "modelling", "accounting"],
  },
  {
    employer: "Morgan Stanley", title: "Sales & Trading Summer Analyst", roleFamily: "MARKETS",
    divisionDesk: "Institutional Securities", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-15", deadlineAt: null, firstSeen: "2026-05-24", lastSeen: "2026-06-03",
    summary: "Rotate across trading, sales and structuring desks, learning how risk is priced and managed across asset classes.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.morganstanley.com/careers/students-graduates",
    sourceType: "CAREERS_PAGE", tags: ["trading", "derivatives", "statistics"],
  },
  {
    employer: "Morgan Stanley", title: "Research Summer Analyst", roleFamily: "RESEARCH",
    divisionDesk: "Equity Research", location: "London", status: "UNKNOWN",
    opensAt: null, deadlineAt: null, firstSeen: "2026-05-26", lastSeen: "2026-06-02",
    summary: "Assist analysts in producing equity research, financial models and thematic notes across covered sectors.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.morganstanley.com/careers/students-graduates",
    sourceType: "CAREERS_PAGE", tags: ["equity research", "modelling", "writing"],
  },

  // --- J.P. Morgan ---------------------------------------------------------
  {
    employer: "J.P. Morgan", title: "Investment Banking Summer Analyst", roleFamily: "IB",
    divisionDesk: "Investment Banking", location: "London", status: "OPENING_SOON",
    opensAt: "2026-08-20", deadlineAt: null, firstSeen: "2026-05-20", lastSeen: "2026-06-04",
    summary: "Contribute to live deal teams across coverage and M&A, gaining hands-on experience in valuation and transaction execution.",
    eligibilityNotes: "Penultimate-year students from all degree backgrounds.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://careers.jpmorgan.com/global/en/students/programs",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "valuation", "excel", "modelling"],
  },
  {
    employer: "J.P. Morgan", title: "Markets Summer Analyst", roleFamily: "MARKETS",
    divisionDesk: "Markets", location: "London", status: "OPENING_SOON",
    opensAt: "2026-08-20", deadlineAt: null, firstSeen: "2026-05-20", lastSeen: "2026-06-04",
    summary: "Desk-based rotations across sales, trading and research within the global markets business.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://careers.jpmorgan.com/global/en/students/programs",
    sourceType: "CAREERS_PAGE", tags: ["trading", "fixed income", "equities"],
  },
  {
    employer: "J.P. Morgan", title: "Quantitative Research Summer Analyst", roleFamily: "QUANT",
    divisionDesk: "Quantitative Research", location: "London", status: "OPENING_SOON",
    opensAt: "2026-08-20", deadlineAt: null, firstSeen: "2026-05-30", lastSeen: "2026-06-04",
    summary: "Build pricing models and analytics alongside quantitative researchers supporting trading desks.",
    eligibilityNotes: "Strong background in a quantitative discipline expected.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://careers.jpmorgan.com/global/en/students/programs",
    sourceType: "CAREERS_PAGE", tags: ["python", "probability", "statistics", "modelling"],
  },

  // --- Bank of America -----------------------------------------------------
  {
    employer: "Bank of America", title: "Global Corporate & Investment Banking Summer Analyst", roleFamily: "IB",
    divisionDesk: "GCIB", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-01", deadlineAt: null, firstSeen: "2026-05-25", lastSeen: "2026-06-03",
    summary: "Support advisory and financing teams across industry coverage and capital markets products.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://campus.bankofamerica.com/programs.html",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "capital markets", "valuation"],
  },
  {
    employer: "Bank of America", title: "Global Markets Summer Analyst", roleFamily: "MARKETS",
    divisionDesk: "Global Markets", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-01", deadlineAt: null, firstSeen: "2026-05-25", lastSeen: "2026-06-03",
    summary: "Rotational programme across trading and sales desks with structured markets training.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://campus.bankofamerica.com/programs.html",
    sourceType: "CAREERS_PAGE", tags: ["trading", "sales", "derivatives"],
  },

  // --- Citi ----------------------------------------------------------------
  {
    employer: "Citi", title: "Banking & Advisory Summer Analyst", roleFamily: "IB",
    divisionDesk: "Banking", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-08", deadlineAt: null, firstSeen: "2026-05-27", lastSeen: "2026-06-02",
    summary: "Join coverage and advisory teams supporting M&A and financing transactions for corporate and institutional clients.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.citigroup.com/global/early-careers/students",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "advisory", "valuation"],
  },
  {
    employer: "Citi", title: "Markets Summer Analyst", roleFamily: "MARKETS",
    divisionDesk: "Markets", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-08", deadlineAt: null, firstSeen: "2026-05-27", lastSeen: "2026-06-02",
    summary: "Experience trading, sales and structuring across rates, credit, FX and equities.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.citigroup.com/global/early-careers/students",
    sourceType: "CAREERS_PAGE", tags: ["fx", "rates", "credit", "trading"],
  },

  // --- Barclays ------------------------------------------------------------
  {
    employer: "Barclays", title: "Investment Banking Summer Analyst", roleFamily: "IB",
    divisionDesk: "Investment Bank", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-10", deadlineAt: null, firstSeen: "2026-05-23", lastSeen: "2026-06-04",
    summary: "Support bankers across coverage and product groups on financing and advisory mandates.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://search.jobs.barclays/early-careers",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "dcm", "ecm", "valuation"],
  },
  {
    employer: "Barclays", title: "Global Markets Summer Analyst", roleFamily: "MARKETS",
    divisionDesk: "Global Markets", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-10", deadlineAt: null, firstSeen: "2026-05-23", lastSeen: "2026-06-04",
    summary: "Desk rotations across macro and credit trading, sales and research.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://search.jobs.barclays/early-careers",
    sourceType: "CAREERS_PAGE", tags: ["macro", "credit", "trading"],
  },
  {
    employer: "Barclays", title: "Research Summer Analyst", roleFamily: "RESEARCH",
    divisionDesk: "Research", location: "London", status: "UNKNOWN",
    opensAt: null, deadlineAt: null, firstSeen: "2026-05-29", lastSeen: "2026-06-01",
    summary: "Work with sector analysts on equity and credit research, building models and contributing to published notes.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://search.jobs.barclays/early-careers",
    sourceType: "CAREERS_PAGE", tags: ["research", "modelling", "writing"],
  },

  // --- UBS -----------------------------------------------------------------
  {
    employer: "UBS", title: "Investment Banking Summer Internship", roleFamily: "IB",
    divisionDesk: "Global Banking", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-05", deadlineAt: null, firstSeen: "2026-05-26", lastSeen: "2026-06-03",
    summary: "Support advisory and capital markets teams across a ten-week placement with real deal exposure.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.ubs.com/global/en/careers/students.html",
    sourceType: "CAREERS_PAGE", tags: ["advisory", "valuation", "excel"],
  },
  {
    employer: "UBS", title: "Asset Management Summer Internship", roleFamily: "ASSET_MGMT",
    divisionDesk: "Asset Management", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-05", deadlineAt: null, firstSeen: "2026-05-31", lastSeen: "2026-06-03",
    summary: "Rotate across investment, product and client functions within a global asset manager.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.ubs.com/global/en/careers/students.html",
    sourceType: "CAREERS_PAGE", tags: ["portfolio", "multi-asset", "research"],
  },

  // --- Deutsche Bank -------------------------------------------------------
  {
    employer: "Deutsche Bank", title: "Origination & Advisory Summer Internship", roleFamily: "IB",
    divisionDesk: "Origination & Advisory", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-12", deadlineAt: null, firstSeen: "2026-05-25", lastSeen: "2026-06-02",
    summary: "Contribute to M&A and financing teams, supporting execution and client coverage.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://careers.db.com/students/",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "financing", "valuation"],
  },
  {
    employer: "Deutsche Bank", title: "Fixed Income & Currencies Summer Internship", roleFamily: "MARKETS",
    divisionDesk: "FIC", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-12", deadlineAt: null, firstSeen: "2026-05-25", lastSeen: "2026-06-02",
    summary: "Desk rotations across rates, credit and FX trading and sales.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://careers.db.com/students/",
    sourceType: "CAREERS_PAGE", tags: ["rates", "fx", "credit", "trading"],
  },

  // --- HSBC ----------------------------------------------------------------
  {
    employer: "HSBC", title: "Global Banking Summer Internship", roleFamily: "CORP_BANKING",
    divisionDesk: "Global Banking", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-20", deadlineAt: null, firstSeen: "2026-05-28", lastSeen: "2026-06-01",
    summary: "Support relationship and coverage teams serving large corporate and institutional clients across financing and advisory.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.hsbc.com/careers/students-and-graduates",
    sourceType: "CAREERS_PAGE", tags: ["corporate banking", "coverage", "credit"],
  },
  {
    employer: "HSBC", title: "Markets & Securities Services Summer Internship", roleFamily: "MARKETS",
    divisionDesk: "Markets & Securities Services", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-20", deadlineAt: null, firstSeen: "2026-05-28", lastSeen: "2026-06-01",
    summary: "Rotate across trading, sales and financing desks within a global markets franchise.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.hsbc.com/careers/students-and-graduates",
    sourceType: "CAREERS_PAGE", tags: ["trading", "fx", "rates"],
  },
  {
    employer: "HSBC", title: "Global Banking Summer Internship", roleFamily: "CORP_BANKING",
    divisionDesk: "Global Banking", location: "Birmingham", status: "OPENING_SOON",
    opensAt: "2026-09-20", deadlineAt: null, firstSeen: "2026-06-01", lastSeen: "2026-06-04",
    summary: "Regional corporate and institutional banking placement supporting client coverage and credit analysis from the Birmingham hub.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.hsbc.com/careers/students-and-graduates",
    sourceType: "CAREERS_PAGE", tags: ["corporate banking", "credit", "coverage"],
  },

  // --- Nomura --------------------------------------------------------------
  {
    employer: "Nomura", title: "Investment Banking Summer Analyst", roleFamily: "IB",
    divisionDesk: "Investment Banking", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-18", deadlineAt: null, firstSeen: "2026-05-27", lastSeen: "2026-06-02",
    summary: "Support coverage and advisory bankers across EMEA mandates with modelling and client preparation.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.nomura.com/careers/",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "valuation", "modelling"],
  },
  {
    employer: "Nomura", title: "Global Markets Summer Analyst", roleFamily: "MARKETS",
    divisionDesk: "Global Markets", location: "London", status: "UNKNOWN",
    opensAt: null, deadlineAt: null, firstSeen: "2026-05-27", lastSeen: "2026-06-02",
    summary: "Desk-based experience across fixed income and equities trading and sales.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.nomura.com/careers/",
    sourceType: "CAREERS_PAGE", tags: ["trading", "fixed income"],
  },

  // --- Jefferies (early opener, currently open) ----------------------------
  {
    employer: "Jefferies", title: "Investment Banking Summer Analyst", roleFamily: "IB",
    divisionDesk: "Investment Banking", location: "London", status: "OPEN",
    opensAt: "2026-05-12", deadlineAt: "2026-06-15", firstSeen: "2026-05-20", lastSeen: "2026-06-04",
    summary: "Hands-on placement on lean deal teams with early responsibility across M&A and financing assignments.",
    eligibilityNotes: "Penultimate-year students. Applications reviewed on a rolling basis — apply early.",
    sponsorshipInfo: SPONSOR_NO, applicationUrl: "https://www.jefferies.com/careers/students/",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "valuation", "modelling", "excel"],
  },

  // --- Rothschild & Co -----------------------------------------------------
  {
    employer: "Rothschild & Co", title: "Global Advisory Summer Internship", roleFamily: "IB",
    divisionDesk: "Global Advisory", location: "London", status: "OPENING_SOON",
    opensAt: "2026-10-01", deadlineAt: null, firstSeen: "2026-05-30", lastSeen: "2026-06-03",
    summary: "Advisory-focused placement on M&A and financing advisory mandates with significant analyst exposure.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.rothschildandco.com/en/careers/early-careers/",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "advisory", "valuation"],
  },

  // --- Evercore (open, fixed deadline) -------------------------------------
  {
    employer: "Evercore", title: "Investment Banking Summer Analyst", roleFamily: "IB",
    divisionDesk: "Advisory", location: "London", status: "OPEN",
    opensAt: "2026-05-05", deadlineAt: "2026-10-31", firstSeen: "2026-05-20", lastSeen: "2026-06-04",
    summary: "Boutique advisory experience with direct exposure to senior bankers on M&A and restructuring assignments.",
    eligibilityNotes: "Penultimate-year students. Highly selective; strong academics expected.",
    sponsorshipInfo: SPONSOR_NO, applicationUrl: "https://www.evercore.com/careers/campus-recruiting/",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "restructuring", "valuation", "modelling"],
  },

  // --- Lazard --------------------------------------------------------------
  {
    employer: "Lazard", title: "Financial Advisory Summer Internship", roleFamily: "IB",
    divisionDesk: "Financial Advisory", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-25", deadlineAt: null, firstSeen: "2026-05-29", lastSeen: "2026-06-02",
    summary: "Advisory placement across M&A and restructuring teams with hands-on analytical work.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.lazard.com/careers/students/",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "restructuring", "valuation"],
  },
  {
    employer: "Lazard", title: "Asset Management Summer Internship", roleFamily: "ASSET_MGMT",
    divisionDesk: "Lazard Asset Management", location: "London", status: "CLOSED",
    opensAt: "2026-03-01", deadlineAt: "2026-05-31", firstSeen: "2026-05-20", lastSeen: "2026-06-01",
    summary: "Investment-focused placement across equity and fixed income strategies; this cycle's window has now closed.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.lazardassetmanagement.com/uk/en_uk/careers",
    sourceType: "CAREERS_PAGE", tags: ["portfolio", "equities", "research"],
  },

  // --- BlackRock -----------------------------------------------------------
  {
    employer: "BlackRock", title: "Summer Internship — Investments", roleFamily: "ASSET_MGMT",
    divisionDesk: "Fundamental & Systematic Investments", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-01", deadlineAt: null, firstSeen: "2026-05-24", lastSeen: "2026-06-04",
    summary: "Work within investment teams across active and index strategies, contributing to research and portfolio analytics.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://careers.blackrock.com/early-careers/",
    sourceType: "CAREERS_PAGE", tags: ["portfolio", "research", "etf", "investing"],
  },
  {
    employer: "BlackRock", title: "Summer Analyst — Systematic & Quantitative", roleFamily: "QUANT",
    divisionDesk: "Systematic Active Equity", location: "Edinburgh", status: "OPENING_SOON",
    opensAt: "2026-09-01", deadlineAt: null, firstSeen: "2026-06-02", lastSeen: "2026-06-04",
    summary: "Apply data and modelling techniques within a systematic investment team based in Edinburgh.",
    eligibilityNotes: "Quantitative degree background expected.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://careers.blackrock.com/early-careers/",
    sourceType: "CAREERS_PAGE", tags: ["python", "statistics", "systematic", "modelling"],
  },

  // --- Schroders -----------------------------------------------------------
  {
    employer: "Schroders", title: "Investment Summer Internship", roleFamily: "ASSET_MGMT",
    divisionDesk: "Investment", location: "London", status: "OPENING_SOON",
    opensAt: "2026-10-06", deadlineAt: null, firstSeen: "2026-05-31", lastSeen: "2026-06-03",
    summary: "Rotational placement across investment desks spanning equities, fixed income and multi-asset.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.schroders.com/en/careers/early-careers/",
    sourceType: "CAREERS_PAGE", tags: ["multi-asset", "equities", "research"],
  },

  // --- Fidelity International ----------------------------------------------
  {
    employer: "Fidelity International", title: "Investment Management Summer Internship", roleFamily: "ASSET_MGMT",
    divisionDesk: "Investment Management", location: "London", status: "OPENING_SOON",
    opensAt: "2026-10-01", deadlineAt: null, firstSeen: "2026-06-01", lastSeen: "2026-06-04",
    summary: "Exposure to portfolio management and research across asset classes within a global investment manager.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://careers.fidelityinternational.com/early-careers",
    sourceType: "CAREERS_PAGE", tags: ["portfolio", "research", "investing"],
  },

  // --- Citadel (open, rolling) ---------------------------------------------
  {
    employer: "Citadel", title: "Investment & Trading Summer Internship", roleFamily: "HEDGE_FUND",
    divisionDesk: "Investment & Trading", location: "London", status: "OPEN",
    opensAt: "2026-04-15", deadlineAt: "2026-06-30", firstSeen: "2026-05-20", lastSeen: "2026-06-04",
    summary: "Immersive buy-side programme pairing interns with investment and trading teams; highly selective with rolling review.",
    eligibilityNotes: "Open to penultimate-year students; exceptional quantitative and analytical ability expected.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.citadel.com/careers/students/",
    sourceType: "CAREERS_PAGE", tags: ["buy-side", "trading", "research", "statistics"],
  },

  // --- Citadel Securities (open, near deadline) ----------------------------
  {
    employer: "Citadel Securities", title: "Quantitative Trading Summer Internship", roleFamily: "QUANT",
    divisionDesk: "Quantitative Trading", location: "London", status: "OPEN",
    opensAt: "2026-04-15", deadlineAt: "2026-06-18", firstSeen: "2026-05-20", lastSeen: "2026-06-04",
    summary: "Work with quantitative traders on pricing, market microstructure and strategy research at a leading market maker.",
    eligibilityNotes: "Strong probability, statistics and programming skills expected.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.citadelsecurities.com/careers/students/",
    sourceType: "CAREERS_PAGE", tags: ["python", "probability", "statistics", "trading"],
  },

  // --- Jane Street (open) --------------------------------------------------
  {
    employer: "Jane Street", title: "Quantitative Trading Internship", roleFamily: "QUANT",
    divisionDesk: "Trading", location: "London", status: "OPEN",
    opensAt: "2026-04-01", deadlineAt: "2026-06-15", firstSeen: "2026-05-20", lastSeen: "2026-06-04",
    summary: "Learn to make markets and reason about probability and risk through trading games and live desk work.",
    eligibilityNotes: "All degree backgrounds welcome; strong quantitative reasoning is essential.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.janestreet.com/join-jane-street/internships/",
    sourceType: "CAREERS_PAGE", tags: ["probability", "trading", "mental maths", "statistics"],
  },
  {
    employer: "Jane Street", title: "Quantitative Research Internship", roleFamily: "QUANT",
    divisionDesk: "Research", location: "London", status: "OPEN",
    opensAt: "2026-04-01", deadlineAt: null, firstSeen: "2026-05-30", lastSeen: "2026-06-04",
    summary: "Apply statistical and modelling techniques to research problems that inform trading strategies.",
    sponsorshipInfo: SPONSOR_YES, applicationUrl: "https://www.janestreet.com/join-jane-street/internships/",
    sourceType: "CAREERS_PAGE", tags: ["python", "statistics", "research", "probability"],
  },

  // --- Point72 -------------------------------------------------------------
  {
    employer: "Point72", title: "Investment Analyst Summer Internship", roleFamily: "HEDGE_FUND",
    divisionDesk: "Long/Short Equity", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-15", deadlineAt: null, firstSeen: "2026-05-31", lastSeen: "2026-06-03",
    summary: "Structured buy-side academy training followed by placement supporting investment teams on fundamental research.",
    eligibilityNotes: "Penultimate-year students with strong analytical skills.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://careers.point72.com/students/",
    sourceType: "CAREERS_PAGE", tags: ["buy-side", "equity research", "modelling"],
  },

  // --- Man Group -----------------------------------------------------------
  {
    employer: "Man Group", title: "Quantitative Summer Internship", roleFamily: "QUANT",
    divisionDesk: "Man AHL / Numeric", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-01", deadlineAt: null, firstSeen: "2026-05-29", lastSeen: "2026-06-03",
    summary: "Research and engineering placement within a systematic investment manager, working on signals and modelling.",
    eligibilityNotes: "Quantitative or computational degree background.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.man.com/early-careers",
    sourceType: "CAREERS_PAGE", tags: ["python", "systematic", "statistics", "modelling"],
  },
  {
    employer: "Man Group", title: "Discretionary Investment Summer Internship", roleFamily: "HEDGE_FUND",
    divisionDesk: "Discretionary", location: "London", status: "UNKNOWN",
    opensAt: null, deadlineAt: null, firstSeen: "2026-05-29", lastSeen: "2026-06-03",
    summary: "Support discretionary portfolio managers with fundamental research across asset classes.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.man.com/early-careers",
    sourceType: "CAREERS_PAGE", tags: ["buy-side", "research", "macro"],
  },

  // --- Blackstone ----------------------------------------------------------
  {
    employer: "Blackstone", title: "Private Equity Summer Analyst", roleFamily: "PRIVATE_EQUITY",
    divisionDesk: "Corporate Private Equity", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-01", deadlineAt: null, firstSeen: "2026-05-26", lastSeen: "2026-06-04",
    summary: "Support deal teams evaluating private equity investments through diligence, modelling and industry research.",
    eligibilityNotes: "Exceptionally competitive; penultimate-year students with top academics.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.blackstone.com/careers/students/",
    sourceType: "CAREERS_PAGE", tags: ["private equity", "lbo", "modelling", "diligence"],
  },
  {
    employer: "Blackstone", title: "Credit & Insurance Summer Analyst", roleFamily: "PRIVATE_EQUITY",
    divisionDesk: "Credit & Insurance", location: "London", status: "UNKNOWN",
    opensAt: null, deadlineAt: null, firstSeen: "2026-05-26", lastSeen: "2026-06-04",
    summary: "Work alongside private credit teams analysing financing opportunities and structured investments.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.blackstone.com/careers/students/",
    sourceType: "CAREERS_PAGE", tags: ["private credit", "structured", "modelling"],
  },

  // --- Macquarie -----------------------------------------------------------
  {
    employer: "Macquarie", title: "Investment Banking Summer Internship", roleFamily: "IB",
    divisionDesk: "Macquarie Capital", location: "London", status: "OPENING_SOON",
    opensAt: "2026-09-22", deadlineAt: null, firstSeen: "2026-05-30", lastSeen: "2026-06-02",
    summary: "Advisory and principal investing placement supporting M&A and infrastructure financing teams.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.macquarie.com/uk/en/about/careers.html",
    sourceType: "CAREERS_PAGE", tags: ["m&a", "infrastructure", "valuation"],
  },
  {
    employer: "Macquarie", title: "Commodities & Global Markets Summer Internship", roleFamily: "MARKETS",
    divisionDesk: "Commodities & Global Markets", location: "London", status: "CLOSED",
    opensAt: "2026-03-15", deadlineAt: "2026-05-25", firstSeen: "2026-05-20", lastSeen: "2026-05-31",
    summary: "Markets placement spanning commodities, financial markets and risk solutions; this cycle's applications have closed.",
    sponsorshipInfo: SPONSOR_CASE, applicationUrl: "https://www.macquarie.com/uk/en/about/careers.html",
    sourceType: "CAREERS_PAGE", tags: ["commodities", "trading", "risk"],
  },
];

export const ukFinance2027: RawDataset = {
  source: "curated:uk-finance-2027",
  employers,
  opportunities,
};
