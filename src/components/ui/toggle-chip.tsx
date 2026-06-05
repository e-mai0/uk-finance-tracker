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
              "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-accent bg-accent-soft text-accent"
                : "border-border-strong bg-surface text-muted hover:border-ink/30 hover:text-ink",
            )}
          >
            <span
              className={cn(
                "flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                active ? "border-accent bg-accent" : "border-border-strong",
              )}
            >
              {active && (
                <svg viewBox="0 0 10 10" className="h-2 w-2 text-white" fill="none">
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
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
