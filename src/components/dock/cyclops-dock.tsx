"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { CyclopsChat } from "@/app/(app)/chat/cyclops-chat";
import { getOrCreateDockThread } from "@/server/actions/dock";
import { dockContextLabel, dockSuggestions } from "@/lib/dock-context";
import { formatShortcut, matchesShortcut } from "@/lib/shortcuts";

type DockState = "docked" | "expanded";

type ThreadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; sessionId: string; messages: UIMessage[] }
  | { status: "error"; message: string };

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
 * The Cyclops dock — a permanent Granola-style right rail.
 *
 * It is ALWAYS docked on shell pages that have room for it (Today, Tracker,
 * Applications, Workspace): a real layout column that reserves its own width so
 * page content sits BESIDE it, never under it. There is no collapsed edge-tab
 * state — the rail is always there. ⌘J toggles a focus overlay (the one other
 * state); Esc returns it to docked.
 *
 * Hidden entirely on Memory and Settings (no room / the agent stays out) and on
 * the full Ask Cyclops page (it would be redundant). Reuses CyclopsChat against
 * a per-user "Dock" ChatSession.
 */
export function CyclopsDock({ badge }: { badge: number }) {
  const pathname = usePathname();
  const [state, setState] = useState<DockState>("docked");
  const stateRef = useRef<DockState>("docked");
  const panelRef = useRef<HTMLDivElement>(null);
  const [thread, setThread] = useState<ThreadState>({ status: "idle" });
  // Platform-aware hint (navigator) — set client-side to avoid hydration drift.
  const [hint, setHint] = useState("Ctrl+J");

  const hidden =
    pathname.startsWith("/settings") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/memory") ||
    // /cv has its own dedicated CV coach in the side-by-side layout (U2); the
    // global dock would be a redundant second assistant fighting for width.
    pathname.startsWith("/cv");

  useEffect(() => {
    setHint(formatShortcut("mod+J"));
  }, []);

  const transition = useCallback((next: DockState) => {
    if (next === stateRef.current) return;
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
      .catch(() =>
        setThread({ status: "error", message: "Couldn't reach Cyclops." }),
      );
  }, []);

  // Always-open: load the dock thread on mount wherever the rail is shown.
  useEffect(() => {
    if (!hidden && thread.status === "idle") loadThread();
  }, [hidden, thread.status, loadThread]);

  // ⌘J toggles the focus overlay; Esc returns to docked (esc stack).
  useEffect(() => {
    if (hidden) return;
    function onKeyDown(e: KeyboardEvent) {
      if (matchesShortcut(e, "mod+J")) {
        // Always claim the chord (Ctrl+J opens browser downloads). Mod chords
        // fire even from editable targets — rule zero exempts them.
        e.preventDefault();
        transition(stateRef.current === "expanded" ? "docked" : "expanded");
        return;
      }
      if (e.key === "Escape" && stateRef.current === "expanded") {
        if (e.defaultPrevented) return;
        const target = e.target;
        if (
          target instanceof Element &&
          target.closest('[role="menu"], [role="listbox"]')
        ) {
          return;
        }
        if (isEditable(target)) {
          // First Esc blurs the dock's own composer; the next docks.
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
  const chatHref =
    thread.status === "ready" ? `/chat?t=${thread.sessionId}` : "/chat";

  const header = (
    <div className="flex items-center gap-2 border-b border-border-agent bg-surface-2 px-3 py-2">
      {/* Click the header to expand to the focus overlay; shortcuts fire silently. */}
      <button
        type="button"
        onClick={() => transition(expanded ? "docked" : "expanded")}
        aria-label={
          expanded ? `Dock Cyclops (${hint})` : `Expand Cyclops (${hint})`
        }
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="label shrink-0 text-accent">
          <span aria-hidden className="text-agent-mark">
            ◆
          </span>{" "}
          CYCLOPS
        </span>
        <span className="label truncate text-faint">
          {dockContextLabel(pathname)}
        </span>
      </button>
      {badge > 0 && (
        <span
          aria-hidden
          className="tabular shrink-0 rounded-pill bg-accent-soft px-1.5 py-0.5 text-[0.6875rem] text-accent"
        >
          {badge}
        </span>
      )}
    </div>
  );

  const footer = (
    <div className="border-t border-border px-3 py-2 text-right">
      <Link href={chatHref} className="label text-accent hover:underline">
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
          // Replay the dock thread's saved history so the conversation persists
          // across reloads and revisits instead of appearing to vanish. The same
          // thread is also reachable via "Open in Ask Cyclops →".
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

  // The aside always reserves 300px on lg+; below lg the rail is hidden (use the
  // Ask Cyclops nav pill). When expanded the panel becomes a fixed overlay but
  // the aside keeps its width, so content never reflows.
  // The tracker page carries a full-width live tape at the very top, so the
  // docked card starts below it (the tape spans full width above the rail).
  const belowTape = pathname.startsWith("/tracker");

  return (
    <aside
      className="hidden w-[360px] shrink-0 py-4 pl-3 pr-5 lg:block"
      aria-label="Cyclops assistant"
    >
      {expanded && (
        <button
          type="button"
          aria-label="Dock Cyclops"
          onClick={() => transition("docked")}
          className="fixed inset-0 z-40 cursor-default bg-ink/30"
        />
      )}
      <div
        ref={panelRef}
        tabIndex={-1}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded || undefined}
        aria-label={expanded ? "Cyclops" : undefined}
        className={
          expanded
            ? "fixed right-0 top-[3.25rem] bottom-3 z-50 flex w-full max-w-2xl flex-col overflow-hidden rounded-l-[0.875rem] border border-border-agent bg-canvas shadow-pop"
            : belowTape
              ? "sticky top-[5.75rem] flex h-[calc(100vh-5.75rem-0.75rem)] flex-col overflow-hidden rounded-card border border-border-agent bg-surface shadow-card"
              : "sticky top-[3.25rem] flex h-[calc(100vh-3.25rem-0.75rem)] flex-col overflow-hidden rounded-card border border-border-agent bg-surface shadow-card"
        }
      >
        {header}
        {body}
        {footer}
      </div>
    </aside>
  );
}
