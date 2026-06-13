// scripts/capture-fixture.ts — run with: npx tsx scripts/capture-fixture.ts <url> <out.json>
// One-off: saves a live endpoint response as a test fixture. Never imported by app code.
import { writeFile } from "node:fs/promises";

// Wrapped in an async IIFE rather than top-level await: tsx compiles this to CJS,
// where top-level await is unsupported.
async function main(): Promise<void> {
  const [, , url, out] = process.argv;
  if (!url || !out) {
    throw new Error("usage: npx tsx scripts/capture-fixture.ts <url> <out.json>");
  }
  const res = await fetch(url, { headers: { "user-agent": "TrackrBot/1.0 (fixture capture)" } });
  await writeFile(out, await res.text());
  console.log(`captured ${url} → ${out} (${res.status})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
