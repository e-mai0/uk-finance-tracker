"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/auth";

const NAV = [
  { href: "/dashboard", label: "Tracker" },
  { href: "/saved", label: "Saved" },
  { href: "/applications", label: "Apps" },
  { href: "/settings", label: "Settings" },
];

export function AppHeader({
  name,
  savedCount,
}: {
  name: string;
  savedCount: number;
}) {
  const pathname = usePathname();

  return (
    <header className="chrome sticky top-0 z-40 border-b border-chrome-line">
      <div className="flex h-11 items-center gap-4 px-3">
        {/* Wordmark — light, amber full-stop */}
        <Link
          href="/dashboard"
          className="text-[1.1rem] font-extrabold tracking-tight text-white"
        >
          Trackr<span className="text-amber">.</span>
        </Link>

        {/* Command line — terminal prompt with blinking amber caret */}
        <div className="hidden items-center gap-2 border-l border-chrome-line pl-4 lg:flex">
          <span className="label text-[0.6rem] text-chrome-dim">INTERN·UK</span>
          <span className="tabular text-[0.72rem] text-amber">SU27</span>
          <span className="tabular text-[0.72rem] text-chrome-dim">‹GO›</span>
          <span aria-hidden className="caret -ml-1 text-amber">
            ▌
          </span>
        </div>

        <nav className="ml-auto flex items-center gap-0.5">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "label relative px-2.5 py-1.5 text-[0.62rem] transition-colors",
                  active
                    ? "text-white"
                    : "text-chrome-ink-2 hover:text-white",
                )}
              >
                {item.label}
                {item.href === "/saved" && savedCount > 0 && (
                  <span className="tabular ml-1 text-[0.6rem] text-amber">
                    {savedCount}
                  </span>
                )}
                {active && (
                  <span className="absolute inset-x-2.5 -bottom-px h-0.5 bg-amber" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 border-l border-chrome-line pl-3">
          <Clock />
          <span className="hidden font-mono text-[0.72rem] text-chrome-ink-2 sm:inline">
            {name}
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="label px-2 py-1 text-[0.6rem] text-chrome-dim transition-colors hover:text-white"
            >
              Exit
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

/** Ticking desk clock. Client-only to avoid hydration mismatch. */
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
    <span className="hidden items-center gap-1.5 sm:inline-flex">
      <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-success" />
      <span className="label text-[0.6rem] text-chrome-dim">Live</span>
      <span
        className="tabular text-[0.72rem] text-chrome-ink"
        suppressHydrationWarning
      >
        {now ?? "··:··:··"}
      </span>
    </span>
  );
}
