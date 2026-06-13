import type { CSSProperties } from "react";
import Link from "next/link";
import type { TrackerItem } from "@/lib/filters";
import { ticker as tickerCode, daysUntil } from "@/lib/utils";

/* The live tape — open positions scroll past as tickers on a light band under
   the header: CODE · status glyph · days-to-deadline ("the change"). Pure CSS
   marquee (globals.css), pauses on hover, halts on reduced-motion. Typographic
   glyphs only (▲ ▼ ◆ ●). Token semantics for legibility on the light surface. */

type Lane = {
  id: string;
  code: string;
  glyph: string;
  tone: string;
  status: string;
  statusTone: string;
  days: number | null;
};

const UP = "text-success";
const DOWN = "text-danger";

function lane(item: TrackerItem, now: Date): Lane {
  const d = daysUntil(item.deadlineAt, now);
  const closingHard = d != null && d >= 0 && d <= 7;
  if (item.status === "OPENING_SOON") {
    return {
      id: item.id,
      code: tickerCode(item.employerName),
      glyph: "◆",
      tone: "text-accent",
      status: "SOON",
      statusTone: "text-accent",
      days: d,
    };
  }
  return {
    id: item.id,
    code: tickerCode(item.employerName),
    glyph: closingHard ? "▼" : "▲",
    tone: closingHard ? DOWN : UP,
    status: "OPEN",
    statusTone: "text-subtle",
    days: d,
  };
}

export function TickerTape({ items }: { items: TrackerItem[] }) {
  const now = new Date();
  const lanes = items
    .filter((i) => i.status === "OPEN" || i.status === "OPENING_SOON")
    .sort((a, b) => {
      const da = daysUntil(a.deadlineAt, now) ?? 9e9;
      const db = daysUntil(b.deadlineAt, now) ?? 9e9;
      return da - db;
    })
    .slice(0, 28)
    .map((i) => ({ item: i, lane: lane(i, now) }));

  if (lanes.length === 0) return null;

  const duration = Math.max(28, lanes.length * 3.4);

  const Cell = ({ item, lane: l }: { item: TrackerItem; lane: Lane }) => (
    <Link
      href={`/tracker/${item.id}`}
      className="group inline-flex items-center gap-2 px-4 py-1.5"
      tabIndex={-1}
    >
      <span className="tabular text-[0.78rem] tracking-wide text-accent group-hover:text-accent-hover">
        {l.code}
      </span>
      <span className={`text-[0.7rem] leading-none ${l.tone}`}>{l.glyph}</span>
      <span className={`label ${l.statusTone}`}>{l.status}</span>
      {l.days != null && l.days >= 0 && (
        <span className="tabular text-[0.74rem] text-subtle">{l.days}d</span>
      )}
      <span aria-hidden className="ml-2 text-border-strong">
        │
      </span>
    </Link>
  );

  const run = (key: string, ariaHidden: boolean) => (
    <div key={key} aria-hidden={ariaHidden} className="flex shrink-0 items-center">
      {lanes.map(({ item, lane: l }) => (
        <Cell key={`${key}-${item.id}`} item={item} lane={l} />
      ))}
    </div>
  );

  return (
    <div className="overflow-hidden border-b border-border bg-canvas">
      <div className="flex items-stretch">
        {/* Left tag — the band's identity, like an index label */}
        <div className="flex shrink-0 items-center gap-2 border-r border-border px-3.5">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-success" />
          <span className="label text-subtle">Live tape</span>
        </div>
        {/* The marquee viewport */}
        <div className="ticker relative min-w-0 flex-1 overflow-hidden">
          <div
            className="ticker-track"
            style={{ "--ticker-duration": `${duration}s` } as CSSProperties}
          >
            {run("a", false)}
            {run("b", true)}
          </div>
          {/* edge fades so cells dissolve rather than clip */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-canvas to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-canvas to-transparent" />
        </div>
      </div>
    </div>
  );
}
