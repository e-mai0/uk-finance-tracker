// scripts/seed-and-sync.ts
// Prod-safe bootstrap for the live tracker: registers the ingestion-source
// registry (idempotent, NO demo/user data) and runs ONE sync with the live
// adapters, printing a per-source result. Because both steps run here with the
// NEW adapter code, this avoids the deploy-order trap (sources are inserted and
// pulled in the same execution, not left for an older deploy's cron to fail on).
//
// Run locally against the shared Supabase DB (localhost + prod share one DB):
//   npx tsx scripts/seed-and-sync.ts
// Requires DATABASE_URL in the environment (your local .env already points at
// the shared DB). Read-only against employer career sites; writes only to your
// own DB.
import { prisma } from "../src/server/db";
import { registerSources } from "../prisma/sources";
import { syncAllSources } from "../src/ingestion/sync";

async function main(): Promise<void> {
  const n = await registerSources(prisma);
  console.log(`Registered ${n} ingestion sources.`);

  console.log("Running sync (live adapters → outbound reads of public job boards)…");
  const results = await syncAllSources(prisma);

  const ok = results.filter((r) => r.ok).length;
  const created = results.reduce((a, r) => a + r.created, 0);
  const updated = results.reduce((a, r) => a + r.updated, 0);
  console.log(`\nSync: ${ok}/${results.length} sources ok · ${created} created · ${updated} updated\n`);
  for (const r of results) {
    const detail = r.ok ? `${r.created}c / ${r.updated}u${r.changed ? " · changed" : ""}` : (r.error ?? "failed");
    console.log(`  ${r.ok ? "OK " : "ERR"}  ${r.employerName.padEnd(22)} ${detail}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
