type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

/** Minimal classnames helper (no dependency). */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue) => {
    if (!v) return;
    if (typeof v === "string" || typeof v === "number") {
      out.push(String(v));
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (typeof v === "object") {
      for (const [k, on] of Object.entries(v)) if (on) out.push(k);
    }
  };
  inputs.forEach(walk);
  return out.join(" ");
}

const GBP_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getUTCDate()} ${GBP_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatShortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getUTCDate()} ${GBP_MONTHS[date.getUTCMonth()]}`;
}

/** Whole days from `now` until `d` (negative if in the past). */
export function daysUntil(
  d: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const ms = date.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** A 3-letter terminal location code (e.g. "London" → "LON", "Edinburgh" →
 *  "EDI"). Strips punctuation; falls back to the first three letters. */
export function locCode(location: string | null | undefined): string {
  if (!location) return "—";
  const cleaned = location.replace(/[^a-zA-Z]/g, "");
  return (cleaned.slice(0, 3) || location.slice(0, 3)).toUpperCase();
}

/** A short, terminal-style ticker code for an employer (e.g. "Helvar Capital"
 *  → "HECA"). Deterministic; used in the dense Desk grid in place of logos. */
export function ticker(name: string): string {
  const words = name
    .replace(/[^a-zA-Z ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const code =
    words.length >= 2
      ? words[0].slice(0, 2) + words[1].slice(0, 2)
      : (words[0] ?? name).slice(0, 4);
  return code.toUpperCase();
}
