// scripts/capture-fixture.ts — run with: npx tsx scripts/capture-fixture.ts <url> <out.json>
// One-off: saves a live endpoint response as a test fixture. Never imported by app code.
import { writeFile } from "node:fs/promises";
const [, , url, out] = process.argv;
const res = await fetch(url, { headers: { "user-agent": "TrackrBot/1.0 (fixture capture)" } });
await writeFile(out, await res.text());
console.log(`captured ${url} → ${out} (${res.status})`);
