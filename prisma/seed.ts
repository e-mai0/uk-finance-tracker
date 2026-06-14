import bcrypt from "bcryptjs";
import { prisma } from "../src/server/db";
import { recomputeMatchScores } from "../src/server/matching";
import { registerSources } from "./sources";

const DEMO_EMAIL = "demo@trackr.local";
const DEMO_PASSWORD = "demo1234";

async function main() {
  // The curated ukFinance2027 dataset is no longer seeded: it was bootstrap
  // placeholder data (generic careers-page apply URLs, hand-set statuses) and is
  // now fully superseded by the live ATS adapters. Opportunities come solely
  // from registered sources + the sync. Run the sync after seeding to populate.

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
  const sourceCount = await registerSources(prisma);
  console.log(
    `  ${sourceCount} sources registered — run the sync (POST /api/ingest/sync with CRON_SECRET) to pull them.`,
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
