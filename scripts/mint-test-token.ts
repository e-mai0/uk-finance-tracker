// Dev-only helper: mint an extension API token for the demo user and print it.
// Usage: npx tsx scripts/mint-test-token.ts
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "demo@trackr.local" },
    select: { id: true },
  });
  if (!user) throw new Error("demo user not found");

  const token = "trk_" + randomBytes(24).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.apiToken.create({
    data: { userId: user.id, name: "smoke-test", tokenHash },
  });
  console.log(token);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
