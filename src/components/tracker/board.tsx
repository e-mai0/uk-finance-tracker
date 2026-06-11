"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toggleSave } from "@/server/actions/saved";

export type BoardRow = {
  id: string;
  employerName: string;
  title: string;
  divisionDesk: string | null;
  status: string; // OpportunityStatus
  deadlineAt: string | null; // ISO
  daysLeft: number | null;
  score: number | undefined;
  saved: boolean;
  agentTags: { kind: string; title: string }[];
};

const FIT = {
  strong: "var(--color-tier-strong)",
  good: "var(--color-tier-good)",
  mod: "var(--color-tier-mod)",
  low: "var(--color-tier-low)",
} as const;

function fitColor(score: number | undefined): string {
  if (score == null) return FIT.low;
  if (score >= 75) return FIT.strong;
  if (score >= 50) return FIT.good;
  if (score >= 25) return FIT.mod;
  return FIT.low;
}

function monogram(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}

export function Board({ rows }: { rows: BoardRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [focusIdx, setFocusIdx] = useState(-1);
  const [density, setDensity] = useState<"compact" | "comfy">("compact");
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  // Density: persisted; comfy is the default on coarse pointers (spec §7).
  useEffect(() => {
    const stored = localStorage.getItem("tracker-density");
    if (stored === "compact" || stored === "comfy") setDensity(stored);
    else if (window.matchMedia("(pointer: coarse)").matches) setDensity("comfy");
  }, []);
  const setAndStoreDensity = (d: "compact" | "comfy") => {
    setDensity(d);
    localStorage.setItem("tracker-density", d);
  };

  // Clamp focusIdx when rows shrink (e.g. filter applied).
  useEffect(() => {
    setFocusIdx((i) => (i >= rows.length ? -1 : i));
  }, [rows.length]);

  // Keyboard: J/K move · ⏎ open · S star · A ask. Single-letter keys are
  // inert while focus is in an editable field (spec keyboard rule zero).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) return;
      if ((t).closest("button, a, summary")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(rows.length - 1, i + 1));
      } else if (key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && focusIdx >= 0) {
        const row = rows[focusIdx];
        if (!row) return;
        router.push(`/tracker/${row.id}`);
      } else if (key === "s" && focusIdx >= 0) {
        const row = rows[focusIdx];
        if (!row) return;
        startTransition(() => void toggleSave(row.id));
      } else if (key === "a" && focusIdx >= 0) {
        const row = rows[focusIdx];
        if (!row) return;
        router.push(`/chat?opportunity=${row.id}`);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rows, focusIdx, router]);

  // Keep the focused row visible.
  useEffect(() => {
    if (focusIdx < 0) return;
    tbodyRef.current
      ?.querySelectorAll("tr")
      [focusIdx]?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);

  const rowH = density === "compact" ? "h-[2.125rem]" : "h-11";

  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="label text-faint">{rows.length} shown</span>
        <div className="ml-auto flex overflow-hidden rounded-pill border border-border">
          {(["comfy", "compact"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={density === d}
              onClick={() => setAndStoreDensity(d)}
              className={cn(
                "label px-3 py-1",
                density === d ? "bg-ink text-canvas" : "text-faint hover:text-ink",
              )}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-strong bg-surface-3 text-left">
            <th scope="col" className="label w-9 px-4 py-1.5 text-faint" aria-label="Monogram" />
            <th scope="col" className="label py-1.5 text-faint">Firm · Role</th>
            <th scope="col" className="label w-24 py-1.5 text-right text-faint">Deadline</th>
            <th scope="col" className="label w-16 py-1.5 text-right text-faint">Days</th>
            <th scope="col" className="label w-28 py-1.5 text-right text-faint">Fit</th>
            <th scope="col" className="label w-20 px-4 py-1.5 text-right text-faint">Status</th>
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {rows.map((row, i) => {
            const closed = row.status === "CLOSED";
            const focused = i === focusIdx;
            return (
              <tr
                key={row.id}
                onClick={() => router.push(`/tracker/${row.id}`)}
                onMouseEnter={() => setFocusIdx(i)}
                data-focused={focused || undefined}
                className={cn(
                  "group cursor-pointer border-b border-hairline transition-colors",
                  rowH,
                  focused
                    ? "bg-surface-2 shadow-[inset_3px_0_0_var(--color-ink)]"
                    : row.agentTags.length > 0 &&
                      "bg-accent-tint shadow-[inset_3px_0_0_var(--color-agent-mark)]",
                )}
              >
                <td className="px-4">
                  <span
                    aria-hidden
                    className={cn(
                      "tabular flex h-5 w-5 items-center justify-center rounded-sm border text-[0.6875rem]",
                      row.agentTags.length > 0
                        ? "border-border-agent bg-accent-soft text-accent"
                        : "border-border bg-surface-2 text-subtle",
                    )}
                  >
                    {monogram(row.employerName)}
                  </span>
                </td>
                <td className="max-w-0 truncate pr-3">
                  <a
                    href={`/tracker/${row.id}`}
                    className="focus-visible:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className={cn("text-[0.8125rem] font-extrabold", closed ? "text-subtle" : "text-ink")}>
                      {row.employerName}
                    </span>
                    <span className={cn("text-[0.75rem] font-bold", closed ? "text-faint" : "text-subtle")}>
                      {" · "}{row.title}
                      {row.divisionDesk ? ` · ${row.divisionDesk}` : ""}
                    </span>
                  </a>
                  {row.agentTags.map((tag) => (
                    <span
                      key={`${tag.kind}:${tag.title}`}
                      className="label ml-2 rounded-pill border border-border-agent bg-accent-soft px-1.5 text-accent"
                    >
                      <span aria-hidden>{tag.kind === "FLAG" ? "▲ " : "◆ "}</span>
                      <span className="sr-only">{tag.kind === "FLAG" ? "deadline flag: " : "Cyclops: "}</span>
                      {tag.title}
                    </span>
                  ))}
                  {row.saved && (
                    <span className="ml-2 text-[0.75rem] text-warning">
                      <span aria-hidden>★</span>
                      <span className="sr-only">saved</span>
                    </span>
                  )}
                </td>
                <td className="tabular py-0 text-right text-[0.75rem] text-muted">
                  {row.deadlineAt
                    ? new Date(row.deadlineAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                    : "—"}
                </td>
                <td
                  className={cn(
                    "tabular text-right text-[0.75rem]",
                    row.daysLeft != null && row.daysLeft <= 14 && !closed ? "text-danger" : "text-muted",
                  )}
                >
                  {row.daysLeft != null && row.daysLeft <= 14 && !closed && <span aria-hidden>▼ </span>}
                  {closed || row.daysLeft == null ? "—" : row.daysLeft}
                </td>
                <td className="text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span aria-hidden className="relative inline-block h-1.5 w-10 overflow-hidden rounded-bar bg-surface-3">
                      <span
                        className="absolute inset-y-0 left-0 rounded-bar"
                        style={{ width: `${row.score ?? 0}%`, background: fitColor(row.score) }}
                      />
                    </span>
                    <span className="tabular w-6 text-right text-[0.75rem]" style={{ color: fitColor(row.score) }}>
                      {row.score ?? "—"}
                    </span>
                  </span>
                </td>
                <td className="px-4 text-right">
                  <span className="relative inline-block">
                    <span
                      className={cn(
                        "label",
                        closed ? "text-faint" : "text-muted",
                        "group-hover:opacity-0 group-focus-within:opacity-0",
                      )}
                    >
                      {row.status === "OPEN" ? "OPEN" : row.status === "OPENING_SOON" ? "SOON" : closed ? "CLOSED" : "—"}
                    </span>
                    {/* Row actions: always in DOM, shown on hover/focus (a11y rule). */}
                    <span className="absolute inset-y-0 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        aria-label={row.saved ? "Unsave" : "Save"}
                        onClick={(e) => {
                          e.stopPropagation();
                          startTransition(() => void toggleSave(row.id));
                        }}
                        className="label min-h-6 rounded-pill border border-border bg-surface px-2 text-subtle hover:border-border-interactive hover:text-ink"
                      >
                        ★
                      </button>
                      <button
                        type="button"
                        aria-label="Ask Cyclops about this listing"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/chat?opportunity=${row.id}`);
                        }}
                        className="label min-h-6 rounded-pill border border-border bg-surface px-2 text-subtle hover:border-agent-mark hover:text-accent"
                      >
                        ◆
                      </button>
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex gap-4 border-t border-hairline px-4 py-2">
        <span className="label text-faint">◆ = CYCLOPS · ▼ = CLOSING ≤14D · ★ = SAVED</span>
        <span className="label ml-auto text-faint">J/K MOVE · ⏎ OPEN · S SAVE · A ASK</span>
      </div>
    </div>
  );
}
