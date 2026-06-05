"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ROLE_FAMILIES,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  UK_LOCATIONS,
} from "@/lib/constants";

export function FiltersBar({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const get = (k: string) => params.get(k) ?? "";
  const getArr = (k: string) =>
    (params.get(k) ?? "").split(",").filter(Boolean);

  const update = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(params.toString());
    mut(p);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const setParam = (key: string, value: string | string[]) =>
    update((p) => {
      const empty = Array.isArray(value) ? value.length === 0 : !value;
      if (empty) p.delete(key);
      else p.set(key, Array.isArray(value) ? value.join(",") : value);
    });

  const toggleInArray = (key: string, value: string) => {
    const current = getArr(key);
    setParam(
      key,
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
  };

  // Debounced search.
  const [q, setQ] = useState(get("q"));
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setQ(params.get("q") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const onSearch = (value: string) => {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setParam("q", value), 300);
  };

  const activeCount =
    getArr("status").length +
    getArr("location").length +
    getArr("family").length +
    (get("deadline") ? 1 : 0) +
    (get("sponsorship") ? 1 : 0) +
    (get("q") ? 1 : 0);

  return (
    <div className="sticky top-14 z-30 -mx-4 border-b border-border bg-canvas/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-[220px] flex-1">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="M14 14l3 3" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search employer, role, division, keyword…"
            className="h-10 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </div>

        <FilterDropdown
          label="Status"
          count={getArr("status").length}
          options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
          selected={getArr("status")}
          onToggle={(v) => toggleInArray("status", v)}
        />
        <FilterDropdown
          label="Location"
          count={getArr("location").length}
          options={UK_LOCATIONS.map((l) => ({ value: l, label: l }))}
          selected={getArr("location")}
          onToggle={(v) => toggleInArray("location", v)}
        />
        <FilterDropdown
          label="Division"
          count={getArr("family").length}
          options={ROLE_FAMILIES.map((r) => ({ value: r.value, label: r.label }))}
          selected={getArr("family")}
          onToggle={(v) => toggleInArray("family", v)}
        />

        <FlagToggle
          label="Has deadline"
          active={!!get("deadline")}
          onClick={() => setParam("deadline", get("deadline") ? "" : "1")}
        />
        <FlagToggle
          label="Sponsors visas"
          active={!!get("sponsorship")}
          onClick={() => setParam("sponsorship", get("sponsorship") ? "" : "1")}
        />

        {/* Sort */}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-subtle sm:inline">Sort</span>
          <div className="relative">
            <select
              value={get("sort") || "best_match"}
              onChange={(e) => setParam("sort", e.target.value)}
              className="h-9 appearance-none rounded-lg border border-border-strong bg-surface pl-3 pr-8 text-sm font-medium text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 20 20"
              className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-subtle">
        <span className="tabular">{resultCount} roles</span>
        {activeCount > 0 && (
          <button
            onClick={() => router.push(pathname, { scroll: false })}
            className="font-medium text-accent hover:underline"
          >
            Clear all filters
          </button>
        )}
      </div>
    </div>
  );
}

function FilterDropdown({
  label,
  count,
  options,
  selected,
  onToggle,
}: {
  label: string;
  count: number;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <details className="group relative">
      <summary
        className={cn(
          "flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
          count > 0
            ? "border-accent/40 bg-accent-soft text-accent"
            : "border-border-strong bg-surface text-ink hover:bg-surface-2",
        )}
      >
        {label}
        {count > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-[0.65rem] font-bold text-white tabular">
            {count}
          </span>
        )}
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4 text-current opacity-60 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-52 rounded-lg border border-border bg-surface p-1.5 shadow-[var(--shadow-pop)]">
        {options.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-ink hover:bg-surface-2"
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border",
                  active ? "border-accent bg-accent" : "border-border-strong",
                )}
              >
                {active && (
                  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-white" fill="none">
                    <path
                      d="M1.5 5l2 2 5-5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function FlagToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
        active
          ? "border-accent/40 bg-accent-soft text-accent"
          : "border-border-strong bg-surface text-ink hover:bg-surface-2",
      )}
    >
      {label}
    </button>
  );
}
