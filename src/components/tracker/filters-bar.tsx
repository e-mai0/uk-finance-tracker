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

/* The desk filter line — a terminal command strip. Typographic glyphs only
   (› ▾ ✓ ×), no drawn icons. */

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
    <div className="bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Command-line search */}
        <div className="flex min-w-[220px] flex-1 items-center border border-border-strong bg-surface focus-within:border-accent">
          <span
            aria-hidden
            className="select-none pl-3 pr-1 font-mono text-sm text-accent"
          >
            ›
          </span>
          <input
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="search firm, role, division, keyword…"
            className="h-9 w-full bg-transparent pr-3 font-mono text-[0.82rem] text-ink placeholder:text-faint focus:outline-none"
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
          <span className="label hidden text-[0.6rem] text-subtle sm:inline">
            Sort
          </span>
          <div className="relative">
            <select
              value={get("sort") || "best_match"}
              onChange={(e) => setParam("sort", e.target.value)}
              className="h-9 appearance-none border border-border-strong bg-surface pl-3 pr-7 font-mono text-[0.8rem] font-medium uppercase tracking-wide text-ink focus-visible:border-accent focus-visible:outline-none"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.7rem] text-subtle"
            >
              ▾
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className="label text-[0.6rem] text-subtle">
          <span className="tabular text-ink">{resultCount}</span> rows
        </span>
        {activeCount > 0 && (
          <>
            <span aria-hidden className="text-border-strong">
              │
            </span>
            <button
              onClick={() => router.push(pathname, { scroll: false })}
              className="label text-[0.6rem] text-accent hover:text-accent-hover hover:underline"
            >
              × Clear {activeCount} filter{activeCount > 1 ? "s" : ""}
            </button>
          </>
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
          "flex h-9 cursor-pointer list-none items-center gap-1.5 border px-3 font-mono text-[0.8rem] font-medium uppercase tracking-wide transition-colors",
          count > 0
            ? "border-accent bg-accent text-accent-fg"
            : "border-border-strong bg-surface text-ink hover:border-accent hover:text-accent",
        )}
      >
        {label}
        {count > 0 && (
          <span className="tabular bg-black/20 px-1 text-[0.62rem] font-bold text-accent-fg">
            {count}
          </span>
        )}
        <span
          aria-hidden
          className="text-[0.68rem] opacity-70 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-52 rounded-[var(--radius-control)] border border-border bg-surface p-1 shadow-[var(--shadow-pop)]">
        {options.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-bar)] px-2 py-1.5 text-left text-[0.82rem] text-ink hover:bg-surface-2"
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-4 w-4 items-center justify-center border font-mono text-[0.66rem] leading-none",
                  active
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border-strong text-transparent",
                )}
              >
                ✓
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
        "h-9 border px-3 font-mono text-[0.8rem] font-medium uppercase tracking-wide transition-colors",
        active
          ? "border-accent bg-accent text-accent-fg"
          : "border-border-strong bg-surface text-ink hover:border-accent hover:text-accent",
      )}
    >
      {label}
    </button>
  );
}
