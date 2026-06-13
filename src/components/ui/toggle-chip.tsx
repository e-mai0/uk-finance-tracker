"use client";

import { cn } from "@/lib/utils";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export function ToggleChipGroup<T extends string>({
  options,
  selected,
  onChange,
  columns,
}: {
  options: ChipOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  columns?: boolean;
}) {
  const toggle = (value: T) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  return (
    <div className={cn("flex flex-wrap gap-2", columns && "flex-col")}>
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={active}
            className={cn(
              // Selection is ink — never amber (GB+ contract).
              "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-[0.8125rem] font-bold transition-colors",
              active
                ? "border-ink bg-surface-3 text-ink"
                : "border-border-interactive bg-surface text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-[2px] border font-mono text-[0.6875rem] font-normal leading-none",
                active
                  ? "border-ink bg-ink text-canvas"
                  : "border-border-interactive text-transparent",
              )}
            >
              ✓
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
