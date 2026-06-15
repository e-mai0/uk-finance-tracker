import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Match Next's automatic JSX runtime so React components (and their JSX) can
  // be unit-tested without importing React into scope.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
  },
});
