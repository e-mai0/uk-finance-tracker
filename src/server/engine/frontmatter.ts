/**
 * gray-matter (via js-yaml) parses unquoted YAML dates like
 * `last_confirmed: 2026-06-10` into JS Date objects. Re-stringifying those
 * produces full ISO timestamps (`2026-06-10T00:00:00.000Z`), so every
 * round-trip drifts the file. Normalize any Date values (including nested
 * ones, e.g. employers_used[].date) back to plain `YYYY-MM-DD` strings
 * before calling matter.stringify.
 */
export function normalizeFrontmatterDates(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normalizeFrontmatterDates);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeFrontmatterDates(v);
    }
    return out;
  }
  return value;
}

/** Typed convenience wrapper for frontmatter data objects. */
export function normalizeFrontmatterData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return normalizeFrontmatterDates(data) as Record<string, unknown>;
}
