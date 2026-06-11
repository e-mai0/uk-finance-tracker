import bcrypt from "bcryptjs";
import { prisma } from "../src/server/db";
import { importDataset } from "../src/ingestion/import";
import { ukFinance2027 } from "../src/ingestion/datasets/uk-finance-2027";
import { recomputeMatchScores } from "../src/server/matching";

const DEMO_EMAIL = "demo@trackr.local";
const DEMO_PASSWORD = "demo1234";

async function main() {
  console.log("→ Importing curated UK finance dataset…");
  const result = await importDataset(prisma, ukFinance2027);
  console.log(
    `  employers: ${result.employers}, opportunities created: ${result.created}, updated: ${result.updated}`,
  );

  console.log("→ Creating demo user…");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const demo = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      name: "Demo Student",
      passwordHash,
      onboardedAt: new Date(),
    },
  });

  await prisma.profile.upsert({
    where: { userId: demo.id },
    update: {},
    create: {
      userId: demo.id,
      university: "University of Cambridge",
      degreeSubject: "Economics",
      degreeType: "BA",
      graduationYear: 2028,
      currentYear: 2,
      workAuth: "UK_CITIZEN",
      skills: ["excel", "valuation", "modelling", "python"],
      gradeInfo: { aLevels: "A*A*A", gpaOrEquivalent: "First-class (predicted)" },
    },
  });

  await prisma.preferences.upsert({
    where: { userId: demo.id },
    update: {},
    create: {
      userId: demo.id,
      targetRoleFamilies: ["IB", "PRIVATE_EQUITY", "MARKETS"],
      preferredLocations: ["London"],
      openToAnywhereUk: false,
      targetEmployers: ["Goldman Sachs", "Morgan Stanley", "Blackstone"],
    },
  });

  console.log("→ Registering live ingestion sources…");
  // Sources verified against src/ingestion/source-plans/uk-finance-2027.json
  // and live probes. ATS boards + custom feeds publish automatically; watchOnly
  // rows are custom-ATS sites we diff for change and flag on /radar (the
  // plans' monitored_change_detection_only strategy). The long tail of
  // boutique firms enters via Firm Scout rather than this seed.
  const liveSources: {
    kind: "GREENHOUSE" | "CAREERS_PAGE";
    identifier: string;
    employerName: string;
    sector?: string;
    url: string;
    watchOnly?: boolean;
  }[] = [
    {
      kind: "GREENHOUSE",
      identifier: "mangroup",
      employerName: "Man Group",
      sector: "Hedge Fund",
      url: "https://job-boards.eu.greenhouse.io/mangroup",
    },
    {
      kind: "GREENHOUSE",
      identifier: "point72",
      employerName: "Point72",
      sector: "Hedge Fund",
      url: "https://job-boards.greenhouse.io/point72",
    },
    // Jane Street lists internships only on its own site; public JSON feed
    // verified live (ids resolve to /join-jane-street/position/<id>/).
    {
      kind: "CAREERS_PAGE",
      identifier: "janestreet-jobs-json",
      employerName: "Jane Street",
      sector: "Proprietary Trading",
      url: "https://www.janestreet.com/jobs/main.json",
    },
    // Custom-ATS watchers — sitemap URL diffs where the site exposes one
    // (verified live for both Citadel domains), page-hash otherwise.
    {
      kind: "CAREERS_PAGE",
      identifier: "citadel-career-sitemap",
      employerName: "Citadel",
      sector: "Hedge Fund",
      url: "https://www.citadel.com/career-sitemap.xml",
      watchOnly: true,
    },
    {
      kind: "CAREERS_PAGE",
      identifier: "citadel-securities-career-sitemap",
      employerName: "Citadel Securities",
      sector: "Market Maker",
      url: "https://www.citadelsecurities.com/career-sitemap.xml",
      watchOnly: true,
    },
    {
      kind: "CAREERS_PAGE",
      identifier: "goldman-higher-gs",
      employerName: "Goldman Sachs",
      sector: "Investment Bank",
      url: "https://higher.gs.com/",
      watchOnly: true,
    },
    {
      kind: "CAREERS_PAGE",
      identifier: "blackrock-students-emea",
      employerName: "BlackRock",
      sector: "Asset Management",
      url: "https://careers.blackrock.com/students-and-graduates-emea",
      watchOnly: true,
    },
    {
      kind: "CAREERS_PAGE",
      identifier: "db-students-programmes",
      employerName: "Deutsche Bank",
      sector: "Investment Bank",
      url: "https://careers.db.com/students-graduates/search-programmes/index?language_id=1",
      watchOnly: true,
    },
  ];
  for (const s of liveSources) {
    await prisma.ingestionSource.upsert({
      where: { kind_identifier: { kind: s.kind, identifier: s.identifier } },
      update: {},
      create: s,
    });
  }
  console.log(
    `  ${liveSources.length} sources registered — run the sync (POST /api/ingest/sync with CRON_SECRET) to pull them.`,
  );

  console.log("→ Computing match scores for demo user…");
  const count = await recomputeMatchScores(demo.id);
  console.log(`  scored ${count} opportunities.`);

  console.log("\n✓ Seed complete.");
  console.log(`  Demo login:  ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
