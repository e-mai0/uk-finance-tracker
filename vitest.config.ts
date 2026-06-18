import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // CV component render tests (U0) statically render .tsx client components via
  // react-dom/server in the node env, so esbuild must use the automatic JSX
  // runtime when transforming component sources. Existing .test.ts files use no
  // JSX, so this is a no-op for them.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
  },
});
