// Post-build step for Tier-2 on-demand injection.
//
// CRXJS scopes a content script's web_accessible_resources to that script's
// `matches`. We deliberately narrow the index content script to known ATS
// domains (so it AUTO-runs only there), but the popup can still inject it into
// any page via activeTab + chrome.scripting. For that injected code to load its
// hashed chunk, the chunk must be web-accessible from any origin. This widens
// exactly the WAR group that carries the index bundle to <all_urls>. It does
// NOT widen where the script auto-runs, and leaves the connect-script group
// (Cyclops origins only) untouched.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve("dist/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const isIndexChunk = (r) => /index\.ts.*\.js$/.test(r);

let widened = 0;
for (const group of manifest.web_accessible_resources ?? []) {
  if ((group.resources ?? []).some(isIndexChunk)) {
    group.matches = ["<all_urls>"];
    widened++;
  }
}

if (widened === 0) {
  console.error("widen-war: no web_accessible_resources group contained the index chunk — Tier-2 injection will be broken.");
  process.exit(1);
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`widen-war: widened ${widened} WAR group(s) to <all_urls> for on-demand injection.`);
