"use client";

import { useEffect, useState } from "react";

/** Global command-rail status line — pinned to the bottom of every page, it
 *  echoes the dark chrome header and carries the brand's amber: a signature
 *  2px amber top hairline, an amber ‹GO› command echo, and amber keyboard-hint
 *  keys. Mirrors the header's tokens so top and bottom rails bookend the desk. */
export function StatusBar() {
  return (
    <footer className="chrome sticky bottom-0 z-40 flex h-7 shrink-0 items-center gap-2.5 border-t-2 border-amber px-3 text-[0.66rem] tracking-wide text-chrome-ink-2">
      <span className="flex items-center gap-1.5">
        <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-success" />
        <span className="label text-[0.6rem] text-chrome-dim">Live</span>
      </span>
      <span aria-hidden className="text-chrome-line">
        ·
      </span>
      <span className="tabular font-semibold tracking-[0.06em] text-amber">
        TRACKR ‹GO›
      </span>
      <span aria-hidden className="hidden text-chrome-line sm:inline">
        ·
      </span>
      <Clock />
      <nav className="ml-auto flex items-center gap-3 sm:gap-4">
        <Hint k="↑↓" label="Navigate" />
        <Hint k="↵" label="Open" />
        <Hint k="/" label="Search" />
      </nav>
    </footer>
  );
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="tabular font-bold text-amber">{k}</span>
      <span className="label hidden text-[0.58rem] text-chrome-dim sm:inline">
        {label}
      </span>
    </span>
  );
}

function Clock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="tabular hidden text-[0.66rem] text-chrome-ink sm:inline"
      suppressHydrationWarning
    >
      {now ?? "··:··:··"}
    </span>
  );
}
