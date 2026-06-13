import { readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type WritingSkill = {
  /** System-prompt body with {{bannedTells}} resolved; {{voice}} still present. */
  body: string;
  /** Canonical banned-AI-tells list, consumed by checkTells in critique.ts. */
  bannedTells: string[];
};

/** Pure: parse the raw markdown skill into its body + banned-tells list. */
export function parseWritingSkill(raw: string): WritingSkill {
  const { data, content } = matter(raw);
  const bannedTells = Array.isArray(data.bannedTells)
    ? data.bannedTells.map((t: unknown) => String(t))
    : [];
  const tellsText = bannedTells.length ? bannedTells.join(", ") : "(none)";
  const body = content.trim().replace("{{bannedTells}}", tellsText);
  return { body, bannedTells };
}

// Read once at module load from the repo source path. We deliberately avoid
// `new URL("./writing.md", import.meta.url)`: webpack rewrites that into an
// asset URL that breaks `next build` page-data collection ("path argument must
// be of type string ... received an instance of URL"). A process.cwd()-relative
// path is opaque to the bundler, so it resolves on the real filesystem at
// runtime; writing.md is kept in the serverless bundle via
// outputFileTracingIncludes (next.config.ts). cwd is the repo root under next
// build/dev/start, vitest and tsx.
const raw = readFileSync(
  path.join(process.cwd(), "src", "server", "engine", "skills", "writing.md"),
  "utf8",
);

/**
 * The loaded writing-craft skill. Single source of truth for craft + tells.
 * @throws if writing.md is absent/unreadable at module load (fail-fast — a
 * server without the writing skill should not start).
 */
export const writingSkill = parseWritingSkill(raw);
