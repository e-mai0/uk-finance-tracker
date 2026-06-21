// src/lib/error-display.ts
//
// Pure, framework-free helpers for the App-Router error boundaries (U1 Part A).
//
// The boundary components stay deliberately trivial; ALL the logic that could
// leak a stack trace or a raw error message to a stranger lives here so it can
// be tested exhaustively. Hard rule: a user-visible string may carry the OPAQUE
// `digest` (a hash Next generates for cross-referencing server logs) but NEVER
// the error message or stack.

/** On-brand, technical-detail-free copy shared by the boundaries. */
export const GENERIC_ERROR_TITLE = "Something went sideways";
export const GENERIC_ERROR_BODY =
  "Cyclops hit a snag loading this. It's not you — try again, and if it keeps happening, head back to a safe page.";

/**
 * Extracts a safe support-reference id from a caught error.
 *
 * Next.js attaches an opaque `digest` (a content hash) to errors thrown on the
 * server; it carries no sensitive content and lets support correlate a report
 * with server logs. We surface ONLY that, and only when it's a non-empty
 * string. We deliberately never read `.message` or `.stack`.
 *
 * @returns the digest string, or null if there isn't a usable one.
 */
export function safeSupportRef(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return null;
  const trimmed = digest.trim();
  return trimmed.length > 0 ? trimmed : null;
}
