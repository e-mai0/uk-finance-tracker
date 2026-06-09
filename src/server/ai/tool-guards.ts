/**
 * Pure guard/transform functions for the edit_memory tool.
 * Kept separate so they can be unit-tested without mocking Prisma.
 */

/** Paths that edit_memory is allowed to write to. */
const ALLOWED_FIXED_PATHS = new Set(["profile.md", "voice.md", "strategy.md"]);
const ALLOWED_SUBDIR_RE = /^(stories|companies)\/[a-z0-9-]+\.md$/;

/**
 * Returns true if the given path is one of the three fixed files or matches
 * the stories/companies pattern. Path must already be lowercase and normalised.
 */
export function isAllowedMemoryPath(path: string): boolean {
  if (ALLOWED_FIXED_PATHS.has(path)) return true;
  return ALLOWED_SUBDIR_RE.test(path);
}

/**
 * Strip any decay annotation appended by annotateDecay / read_memory before
 * writing content back to disk.
 */
export function stripDecayAnnotations(content: string): string {
  return content.replace(/\s*\[decayed to: (high|medium|low)\]/g, "");
}

/**
 * Normalise the `reasons` JSON field from MatchScore into a string array.
 * Handles: string[] (already an array), JSON-encoded string[], a plain string,
 * null/undefined, and garbage (returns [] for unrecognised types).
 */
export function normalizeReasons(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {
      // Not valid JSON — treat the whole string as one reason
    }
    return [value];
  }
  return [];
}
