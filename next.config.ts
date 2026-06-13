import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // We have a stray lockfile in the home directory; pin the tracing root to
  // this project so Vercel traces the right files.
  outputFileTracingRoot: process.cwd(),
  // Belt-and-braces: ensure the writing-craft skill file is traced into every
  // serverless function bundle. The loader already reads it via
  // `new URL("./writing.md", import.meta.url)` (which @vercel/nft traces), but
  // this guarantees inclusion regardless of inference. Validate with a real
  // `next build` in CI / a clean checkout.
  outputFileTracingIncludes: {
    "**": ["src/server/engine/skills/writing.md"],
  },
  // Linting is run separately (npm run lint). Don't let a lint warning block
  // a deploy — type-checking still runs and will fail the build on real errors.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
