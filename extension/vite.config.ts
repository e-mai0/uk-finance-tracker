import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

// CRXJS wires up the MV3 manifest: it bundles the background service worker,
// content scripts and popup, and rewrites the manifest with hashed filenames.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
  server: { port: 5174, strictPort: true },
});
