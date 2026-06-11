/**
 * Minimal RFC 5545 (iCalendar) builder for deadline exports — no dependency.
 * Pure + unit-tested; the /api/saved/calendar route feeds it saved roles.
 */

export interface CalendarEvent {
  /** Stable unique id (we use the opportunity id). */
  uid: string;
  title: string;
  /** All-day event date. */
  date: Date;
  description?: string;
  url?: string;
}

/** Escape per RFC 5545 §3.3.11: backslash, semicolon, comma, newline. */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function icsTimestamp(d: Date): string {
  return `${icsDate(d)}T${String(d.getUTCHours()).padStart(2, "0")}${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}Z`;
}

/** Fold lines longer than 75 octets with a CRLF + space, per RFC 5545 §3.1.
 *  Splitting on character count is fine for our ASCII-dominant content. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

export function buildCalendar(
  events: CalendarEvent[],
  now: Date = new Date(),
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Trackr//UK Finance Internship Tracker//EN",
    "CALSCALE:GREGORIAN",
    fold(`X-WR-CALNAME:${escapeIcsText("Trackr — application deadlines")}`),
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:${escapeIcsText(e.uid)}@trackr`),
      `DTSTAMP:${icsTimestamp(now)}`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      fold(`SUMMARY:${escapeIcsText(e.title)}`),
      ...(e.description
        ? [fold(`DESCRIPTION:${escapeIcsText(e.description)}`)]
        : []),
      ...(e.url ? [fold(`URL:${escapeIcsText(e.url)}`)] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
