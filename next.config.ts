import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // We have a stray lockfile in the home directory; pin the tracing root to
  // this project so Vercel traces the right files.
  outputFileTracingRoot: process.cwd(),
  // Linting is run separately (npm run lint). Don't let a lint warning block
  // a deploy — type-checking still runs and will fail the build on real errors.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
