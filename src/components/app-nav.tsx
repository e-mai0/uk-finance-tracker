"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/auth";
import { formatShortcut } from "@/lib/shortcuts";

const NAV: { href: string; label: string; badgeKey?: "today" | "applications" | "chat" }[] = [
  { href: "/today", label: "Today", badgeKey: "today" },
  { href: "/tracker", label: "Tracker" },
  { href: "/applications", label: "Applications", badgeKey: "applications" },
  { href: "/chat", label: "Ask Cyclops", badgeKey: "chat" },
  { href: "/memory", label: "Memory" },
];

export type NavBadges = { today: number; applications: number; chat: number };

export function AppNav({
  name,
  badges,
  activity,
}: {
  name: string;
  badges: NavBadges;
  /** Agent activity pill text, e.g. "worked overnight" | "idle". */
  activity: string;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [kHint, setKHint] = useState("⌘K");
  const menuRef = useRef<HTMLDivElement>(null);

  // Platform-aware hint must render client-side (navigator).
  useEffect(() => setKHint(formatShortcut("mod+K")), []);

  // Close the avatar menu on outside click / esc.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-canvas/95 backdrop-blur-sm">
      <div className="flex items-center gap-2.5 px-5 py-2.5">
        <Link
          href="/today"
          className="font-display text-[1.0625rem] font-semibold text-ink"
        >
          cyclops<span className="text-accent">.</span>
        </Link>

        <nav aria-label="Primary" className="ml-3 flex items-center gap-1">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const count = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={
                  count > 0
                    ? `${item.label}, ${count} items need attention`
                    : item.label
                }
                className={cn(
                  "rounded-pill px-3 py-1.5 text-[0.8125rem] font-bold transition-colors",
                  active
                    ? "bg-ink text-canvas"
                    : "text-subtle hover:bg-surface-2 hover:text-ink",
                )}
              >
                {item.label}
                {count > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      "tabular ml-1.5 text-[0.6875rem]",
                      active ? "text-amber" : "text-accent",
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {/* ⌘K affordance — palette itself lands with the dock (Plan 3) */}
          <button
            type="button"
            className="label flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-1.5 text-faint"
          >
            <span aria-hidden className="text-accent">
              ›
            </span>
            <span suppressHydrationWarning>{kHint}</span>
          </button>

          {/* Agent activity pill — click target becomes the activity log (Plan 4) */}
          <span className="label flex items-center gap-2 rounded-pill bg-surface-2 px-3 py-1.5 text-subtle">
            <span aria-hidden className="text-agent-mark">
              ●
            </span>
            {activity}
          </span>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Account: ${name}`}
              onClick={() => setMenuOpen((v) => !v)}
              className="tabular flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[0.6875rem] text-canvas"
            >
              {initials}
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-9 w-44 rounded-control border border-border bg-surface py-1 shadow-pop"
              >
                <Link
                  role="menuitem"
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3.5 py-2 text-[0.8125rem] font-bold text-muted hover:bg-surface-2 hover:text-ink"
                >
                  Settings
                </Link>
                <form action={signOutAction}>
                  <button
                    role="menuitem"
                    type="submit"
                    className="block w-full px-3.5 py-2 text-left text-[0.8125rem] font-bold text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
