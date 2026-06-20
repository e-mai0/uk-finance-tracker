import { describe, expect, it } from "vitest";
import { buildCalendar, escapeIcsText } from "../lib/ics";

const NOW = new Date("2026-06-10T12:00:00Z");

describe("escapeIcsText", () => {
  it("escapes commas, semicolons, backslashes and newlines", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});

describe("buildCalendar", () => {
  it("produces a valid skeleton with CRLF line endings", () => {
    const ics = buildCalendar([], NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).not.toMatch(/[^\r]\n/); // every LF is preceded by CR
  });

  it("renders an all-day event per entry", () => {
    const ics = buildCalendar(
      [
        {
          uid: "opp1",
          title: "Goldman Sachs — IB Summer Analyst deadline",
          date: new Date("2026-10-31T00:00:00Z"),
          url: "https://example.com/apply",
        },
      ],
      NOW,
    );
    expect(ics).toContain("UID:opp1@cyclops");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261031");
    expect(ics).toContain("SUMMARY:Goldman Sachs — IB Summer Analyst deadline");
    expect(ics).toContain("URL:https://example.com/apply");
    expect(ics).toContain("DTSTAMP:20260610T120000Z");
  });

  it("folds lines longer than 75 characters with a leading space", () => {
    const long = "X".repeat(120);
    const ics = buildCalendar(
      [{ uid: "opp2", title: long, date: new Date("2026-10-31T00:00:00Z") }],
      NOW,
    );
    const folded = ics
      .split("\r\n")
      .filter((l) => l.startsWith("SUMMARY:") || l.startsWith(" "));
    expect(folded.length).toBeGreaterThan(1);
    const unfolded = folded.map((l, i) => (i === 0 ? l : l.slice(1))).join("");
    expect(unfolded).toContain(long);
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });
});
