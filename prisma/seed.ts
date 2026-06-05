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
