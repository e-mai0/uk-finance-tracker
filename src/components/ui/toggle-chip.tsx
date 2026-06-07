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
              "inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-accent bg-accent-soft text-accent"
                : "border-border-strong bg-surface text-muted hover:border-ink/30 hover:text-ink",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-[2px] border font-mono text-[0.66rem] leading-none",
                active
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border-strong text-transparent",
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
