"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Free-text tag entry with optional autocomplete suggestions. */
export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  max = 40,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    if (value.length >= max) return;
    onChange([...value, v]);
    setDraft("");
  };

  const remove = (v: string) => onChange(value.filter((x) => x !== v));

  const filteredSuggestions = suggestions
    .filter(
      (s) =>
        !value.some((v) => v.toLowerCase() === s.toLowerCase()) &&
        (draft ? s.toLowerCase().includes(draft.toLowerCase()) : true),
    )
    .slice(0, 6);

  return (
    <div>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-ink"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="text-subtle hover:text-danger"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="h-7 flex-1 border-0 bg-transparent px-1 text-sm text-ink placeholder:text-subtle focus-visible:outline-none"
        />
      </div>

      {filteredSuggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted hover:border-ink/30 hover:text-ink"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
