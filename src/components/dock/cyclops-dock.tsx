"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import { CyclopsChat } from "@/app/(app)/chat/cyclops-chat";
import { getOrCreateDockThread } from "@/server/actions/dock";
import { dockContextLabel, dockSuggestions } from "@/lib/dock-context";
import { formatShortcut, matchesShortcut } from "@/lib/shortcuts";

type DockState = "collapsed" | "docked" | "expanded";

type ThreadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; sessionId: string; messages: UIMessage[] }
  | { status: "error"; message: string };

const STORAGE_KEY = "dock-state";

/**
 * Persistence law: "expanded" is NEVER written to storage — an overlay must
 * not resurrect itself on reload, so while expanded we store "docked" (the
 * state Escape returns to). Leaving expanded persists the real target state.
 */
function persist(value: DockState) {
  try {
    localStorage.setItem(STORAGE_KEY, value === "expanded" ? "docked" : value);
  } catch (_e) {
    // storage unavailable (private mode) — state stays session-local
  }
}

function isEditable(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * The Cyclops dock — collapsed edge tab ⇄ 286px docked rail ⇄ expanded
 * overlay, on every page except /settings and /chat. Reuses CyclopsChat against a
 * lazily-fetched per-user "Dock" ChatSession. It yields to the full Ask Cyclops
 * page, which has its own chat UI.
 */
export function CyclopsDock({ badge }: { badge: number }) {
  const pathname = usePathname();
  const [state, setState] = useState<DockState>("collapsed");
  const stateRef = useRef<DockState>("collapsed");
  // Where ⌘J returns to when toggled while expanded.
  const prevRef = useRef<DockState>("docked");
  const panelRef = useRef<HTMLElement>(null);
  const [thread, setThread] = useState<ThreadState>({ status: "idle" });
  // Platform-aware hints must render client-side (navigator) — app-nav kHint
  // pattern: useEffect-set state + suppressHydrationWarning.
  const [hints, setHints] = useState({ expand: "Ctrl+J", collapse: "Ctrl+\\" });

  const hidden = pathname.startsWith("/settings") || pathname.startsWith("/chat");

  useEffect(() => {
    setHints({
      expand: formatShortcut("mod+J"),
      collapse: formatShortcut("collapse"),
    });
  }, []);

  const transition = useCallback((next: DockState) => {
    const current = stateRef.current;
    if (next === current) return;
    if (next === "expanded") prevRef.current = current;
    persist(next);
    stateRef.current = next;
    setState(next);
  }, []);

  // Read persisted state after mount (avoids hydration mismatch with the
  // server-rendered "collapsed" default). A stored "expanded" normalizes to
  // "docked" — see persist() — and the normalized value is written back.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch (_e) {
      // storage unavailable — keep default
    }
    // Docked is the default (per the approved GB+ design) — the rail is
    // visible until the user explicitly collapses it. Only a stored
    // "collapsed" keeps it hidden; "expanded" normalizes to docked.
    const next: DockState = stored === "collapsed" ? "collapsed" : "docked";
    if (stored === "expanded") persist(next);
    stateRef.current = next;
    setState(next);
  }, []);

  const loadThread = useCallback(() => {
    setThread({ status: "loading" });
    getOrCreateDockThread()
      .then((res) => {
        if ("error" in res) {
          setThread({ status: "error", message: res.error });
        } else {
          setThread({
            status: "ready",
            sessionId: res.sessionId,
            messages: res.messages,
          });
        }
      })
      .catch((_e) =>
        setThread({ status: "error", message: "Couldn't reach Cyclops." }),
      );
  }, []);

  // Lazy thread fetch: the first time the dock opens (state leaves collapsed).
  useEffect(() => {
    if (!hidden && state !== "collapsed" && thread.status === "idle") {
      loadThread();
    }
  }, [hidden, state, thread.status, loadThread]);

  // Keyboard: mod+J expand-toggle, collapse chord, Escape (expanded only).
  useEffect(() => {
    if (hidden) return;
    function onKeyDown(e: KeyboardEvent) {
      if (matchesShortcut(e, "mod+J")) {
        // Always claim the chord (Ctrl+J opens browser downloads). Mod chords
        // fire even from editable targets — rule zero exempts them.
        e.preventDefault();
        const current = stateRef.current;
        transition(current === "expanded" ? prevRef.current : "expanded");
        return;
      }
      if (matchesShortcut(e, "collapse")) {
        e.preventDefault();
        transition(stateRef.current === "collapsed" ? "docked" : "collapsed");
        return;
      }
      // Rule zero: Escape is the only non-modifier key handled, and only
      // while the overlay is up.
      if (e.key === "Escape" && stateRef.current === "expanded") {
        if (e.defaultPrevented) return;
        const target = e.target;
        // Leave open menus/listboxes to their own Escape handling.
        if (
          target instanceof Element &&
          target.closest('[role="menu"], [role="listbox"]')
        ) {
          return;
        }
        if (isEditable(target)) {
          // Editable target: act only when it's the dock's own composer —
          // first Escape blurs it; the next Escape (body target) docks.
          if (!panelRef.current?.contains(target)) return;
          e.preventDefault();
          target.blur();
          return;
        }
        transition("docked");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hidden, transition]);

  // Move focus into the overlay when it opens.
  useEffect(() => {
    if (state === "expanded") panelRef.current?.focus();
  }, [state]);

  if (hidden) return null;

  const expanded = state === "expanded";
  const open = state !== "collapsed";
  const chatHref =
    thread.status === "ready" ? `/chat?t=${thread.sessionId}` : "/chat";

  const header = (
    <div className="flex items-center gap-2 border-b border-border-agent bg-surface-2 px-3 py-2">
      <span className="label shrink-0 text-accent">
        <span aria-hidden className="text-agent-mark">
          ◆
        </span>{" "}
        CYCLOPS
      </span>
      <span className="label truncate text-faint">
        {dockContextLabel(pathname)}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => transition(expanded ? "docked" : "expanded")}
          aria-label={
            expanded
              ? `Dock Cyclops (${hints.expand})`
              : `Expand Cyclops (${hints.expand})`
          }
          className="label rounded-control border border-border bg-surface px-1.5 py-0.5 text-subtle transition-colors hover:border-border-interactive hover:text-ink"
        >
          <span suppressHydrationWarning>{hints.expand}</span>
        </button>
        <button
          type="button"
          onClick={() => transition("collapsed")}
          aria-label={`Hide Cyclops (${hints.collapse})`}
          className="label rounded-control border border-border bg-surface px-1.5 py-0.5 text-subtle transition-colors hover:border-border-interactive hover:text-ink"
        >
          —
        </button>
      </div>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
      <span className="label text-faint" suppressHydrationWarning>
        {hints.expand} EXPAND · {hints.collapse} HIDE
      </span>
      <Link
        href={chatHref}
        className="label shrink-0 text-accent hover:underline"
      >
        Open in Ask Cyclops →
      </Link>
    </div>
  );

  const body =
    thread.status === "ready" ? (
      <div className="min-h-0 flex-1">
        <CyclopsChat
          key={thread.sessionId}
          sessionId={thread.sessionId}
          initialMessages={thread.messages}
          compact={!expanded}
          suggestions={dockSuggestions(pathname)}
        />
      </div>
    ) : thread.status === "error" ? (
      <div className="flex-1 px-3 py-3">
        <p className="label text-danger">
          <span aria-hidden>▲</span> {thread.message}
        </p>
        <button
          type="button"
          onClick={loadThread}
          className="label mt-2 rounded-pill border border-border-interactive bg-surface px-3 py-1.5 text-ink transition-colors hover:bg-surface-2"
        >
          Retry
        </button>
      </div>
    ) : (
      <div className="flex-1 px-3 py-3" aria-live="polite">
        <p className="label text-faint">waking Cyclops…</p>
      </div>
    );

  return (
    <>
      {/* Edge tab: shows whenever collapsed (any width) AND while docked
          below lg — the docked rail is lg-only, so the tab is its small-screen
          stand-in (tapping it opens the overlay, which works at all widths). */}
      {state !== "expanded" && (
        <button
          type="button"
          onClick={() => transition(state === "docked" ? "expanded" : "docked")}
          aria-label={`Open Cyclops (${hints.expand})${
            badge > 0 ? `, ${badge} items need attention` : ""
          }`}
          className={cn(
            "fixed bottom-24 right-2 z-40 flex flex-col items-center gap-1.5 rounded-pill border border-border-agent bg-surface px-1.5 py-3 shadow-card transition-colors hover:border-agent-mark",
            state === "docked" && "lg:hidden",
          )}
        >
          <span aria-hidden className="text-agent-mark">
            ◆
          </span>
          {badge > 0 && (
            <span
              aria-hidden
              className="tabular rounded-pill bg-accent px-1.5 py-0.5 text-[0.6875rem] text-accent-fg"
            >
              {badge}
            </span>
          )}
        </button>
      )}

      {/* The panel mounts on first open and then STAYS mounted (display:none
          when collapsed) so CyclopsChat keeps in-flight state across
          collapse/reopen. Backdrop and panel are keyed siblings so React
          preserves the panel instance (no chat remount) when the overlay
          backdrop appears/disappears on docked ⇄ expanded. */}
      {thread.status !== "idle" && (
        <div
          className={
            expanded
              ? "fixed inset-0 z-50 flex justify-end"
              : open
                ? "contents"
                : "hidden"
          }
        >
          {expanded && (
            <button
              key="backdrop"
              type="button"
              aria-label="Dock Cyclops"
              onClick={() => transition("docked")}
              className="absolute inset-0 cursor-default bg-ink/30"
            />
          )}
          <aside
            key="panel"
            ref={panelRef}
            tabIndex={-1}
            role={expanded ? "dialog" : undefined}
            aria-modal={expanded || undefined}
            aria-label={expanded ? "Cyclops" : "Cyclops assistant"}
            className={
              expanded
                ? "relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-border-agent bg-canvas"
                : "sticky top-12 hidden h-[calc(100vh-3rem)] w-[286px] shrink-0 border-l border-border-agent bg-surface lg:flex lg:flex-col"
            }
          >
            {header}
            {body}
            {footer}
          </aside>
        </div>
      )}
    </>
  );
}
