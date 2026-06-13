import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // We have a stray lockfile in the home directory; pin the tracing root to
  // this project so Vercel traces the right files.
  outputFileTracingRoot: process.cwd(),
  // The writing engine reads src/server/engine/skills/writing.md at runtime via
  // a process.cwd()-relative path (see skills/index.ts). Keep that markdown in
  // the serverless bundle for any route that loads the engine.
  outputFileTracingIncludes: {
    "/**/*": ["./src/server/engine/skills/writing.md"],
  },
  // Linting is run separately (npm run lint). Don't let a lint warning block
  // a deploy — type-checking still runs and will fail the build on real errors.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
