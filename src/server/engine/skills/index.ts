import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

// Read once at module load. `new URL(..., import.meta.url)` is statically
// traced by @vercel/nft so writing.md is bundled into the serverless function
// (verified in Task 8). Works in vitest (node env) and tsx (the eval) too.
const raw = readFileSync(fileURLToPath(new URL("./writing.md", import.meta.url)), "utf8");

/**
 * The loaded writing-craft skill. Single source of truth for craft + tells.
 * @throws if writing.md is absent/unreadable at module load (fail-fast — a
 * server without the writing skill should not start).
 */
export const writingSkill = parseWritingSkill(raw);
