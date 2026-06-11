"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatShortcut, matchesShortcut } from "@/lib/shortcuts";
import { paletteSearch, type PaletteResults } from "@/server/actions/palette";

const NAV_ITEMS: { id: string; label: string; href: string }[] = [
  { id: "nav-today", label: "Today", href: "/today" },
  { id: "nav-tracker", label: "Tracker", href: "/tracker" },
  { id: "nav-applications", label: "Applications", href: "/applications" },
  { id: "nav-chat", label: "Ask Cyclops", href: "/chat" },
  { id: "nav-memory", label: "Memory", href: "/memory" },
  { id: "nav-radar", label: "Radar", href: "/radar" },
  { id: "nav-activity", label: "Activity", href: "/activity" },
  { id: "nav-settings", label: "Settings", href: "/settings" },
];

const EMPTY: PaletteResults = { listings: [], threads: [] };

type Item = { id: string; label: string; href: string };
type Section = { caption: string; items: Item[] };

/**
 * ⌘K command palette. The trigger button replaces the inert app-nav stub;
 * mod+K toggles from anywhere (document listener — rule zero exempts modifier
 * chords). While open, all other keys are handled on the input's onKeyDown,
 * never on document: Escape closes with preventDefault() so the dock's own
 * Escape handler (which checks defaultPrevented) doesn't also act.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResults>(EMPTY);
  const [selected, setSelected] = useState(0);
  const [kHint, setKHint] = useState("⌘K");
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Platform-aware hint must render client-side (navigator) — kHint pattern.
  useEffect(() => setKHint(formatShortcut("mod+K")), []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setSelected(0);
    triggerRef.current?.focus();
  }, []);

  // mod+K toggles from anywhere, including editable targets.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (matchesShortcut(e, "mod+K")) {
        e.preventDefault();
        setOpen((v) => {
          if (v) {
            setQuery("");
            setResults(EMPTY);
            setSelected(0);
          }
          return !v;
        });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounced search — 250ms after the last keystroke; stale replies dropped.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(EMPTY);
      setSelected(0);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      paletteSearch(term)
        .then((r) => {
          if (cancelled) return;
          setResults(r);
          setSelected(0);
        })
        .catch(() => {
          // network hiccup — keep whatever is on screen
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const sections: Section[] = [{ caption: "NAV", items: NAV_ITEMS }];
  if (results.listings.length > 0) {
    sections.push({
      caption: "LISTINGS",
      items: results.listings.map((l) => ({
        id: `listing-${l.id}`,
        label: l.label,
        href: `/tracker/${l.id}`,
      })),
    });
  }
  if (results.threads.length > 0) {
    sections.push({
      caption: "CONVERSATIONS",
      items: results.threads.map((t) => ({
        id: `thread-${t.id}`,
        label: t.label,
        href: `/chat?t=${t.id}`,
      })),
    });
  }
  const allItems = sections.flatMap((s) => s.items);
  const active = allItems[Math.min(selected, allItems.length - 1)];
  const activeId = active ? `palette-opt-${active.id}` : undefined;

  const go = useCallback(
    (href: string) => {
      router.push(href);
      close();
    },
    [router, close],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      // Level-1 overlay: claim the Escape so the dock (level 0, checks
      // defaultPrevented) stays put.
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, allItems.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (active) go(active.href);
    }
  }

  let flatIndex = -1;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Open command palette (${kHint})`}
        className="label flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-1.5 text-faint transition-colors hover:border-border-interactive hover:text-ink"
      >
        <span aria-hidden className="text-accent">
          ›
        </span>
        <span suppressHydrationWarning>{kHint}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <button
            type="button"
            aria-label="Close command palette"
            onClick={close}
            className="absolute inset-0 cursor-default bg-ink/30"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative z-10 mt-[12vh] h-fit w-full max-w-lg rounded-card border border-border bg-surface shadow-pop"
          >
            <div className="border-b border-border px-4 py-3">
              <label htmlFor="palette-input" className="sr-only">
                Search pages, listings and conversations
              </label>
              <input
                id="palette-input"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                aria-controls="palette-listbox"
                aria-activedescendant={activeId}
                autoComplete="off"
                spellCheck={false}
                placeholder="Search pages, listings, conversations…"
                className="w-full bg-transparent font-mono text-[0.875rem] text-ink outline-none placeholder:text-faint"
              />
            </div>

            <div
              role="listbox"
              id="palette-listbox"
              aria-label="Palette results"
              className="max-h-[50vh] overflow-y-auto py-1"
            >
              {sections.map((section) => (
                <div key={section.caption}>
                  <div className="px-4 pb-0.5 pt-2">
                    <span className="label text-faint">{section.caption}</span>
                  </div>
                  {section.items.map((item) => {
                    flatIndex += 1;
                    const idx = flatIndex;
                    const isSelected = active?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        id={`palette-opt-${item.id}`}
                        role="option"
                        aria-selected={isSelected}
                        // Keep focus on the input — listbox options are not
                        // tab stops; mousedown would otherwise steal focus.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => go(item.href)}
                        onMouseMove={() => setSelected(idx)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 px-4 py-1.5 text-[0.8125rem]",
                          // Selection law (§2): ink inset, never amber.
                          isSelected
                            ? "bg-surface-2 text-ink shadow-[inset_3px_0_0_var(--color-ink)]"
                            : "text-muted",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "w-3 shrink-0 text-center text-[0.6875rem]",
                            isSelected ? "text-ink" : "text-faint",
                          )}
                        >
                          {isSelected ? "›" : ""}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {query.trim().length >= 2 &&
                results.listings.length === 0 &&
                results.threads.length === 0 && (
                  <p className="px-4 py-2">
                    <span className="label text-faint">
                      no listings or conversations match
                    </span>
                  </p>
                )}
            </div>

            <div className="border-t border-border px-4 py-2">
              <span className="label text-faint">
                ↑↓ move · ⏎ open · esc close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
