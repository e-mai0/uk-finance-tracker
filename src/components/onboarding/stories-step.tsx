"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { seedStories } from "@/app/onboarding/cyclops-actions";

interface StoriesStepProps {
  onContinue: () => void;
  onSkip: () => void;
}

const PROMPTS = [
  "A time you led something…",
  "A time something went wrong…",
  "Something you built, analysed, or achieved…",
];

export function StoriesStep({ onContinue, onSkip }: StoriesStepProps) {
  const [entries, setEntries] = useState<[string, string, string]>([
    "",
    "",
    "",
  ]);
  const [softError, setSoftError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allEmpty = entries.every((e) => !e.trim());

  function updateEntry(index: number, value: string) {
    setEntries((prev) => {
      const next: [string, string, string] = [...prev] as [
        string,
        string,
        string,
      ];
      next[index] = value;
      return next;
    });
  }

  function handleSave() {
    setSoftError(null);
    startTransition(async () => {
      const res = await seedStories(entries.filter((e) => e.trim()));
      if (!res.ok) {
        setSoftError(
          "Couldn't process right now — you can add this later in chat.",
        );
      }
      onContinue();
    });
  }

  function handleSkip() {
    setSoftError(null);
    onSkip();
  }

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight text-ink">
        Your stories
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Real anecdotes are what make answers sound human. Rough bullets are
        perfect — Cyclops structures them and never invents details.
      </p>

      <div className="mt-6 space-y-4">
        {entries.map((value, i) => (
          <div key={i}>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              {PROMPTS[i]}
            </label>
            <textarea
              className={cn(
                "w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-subtle",
                "resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1",
                "min-h-[100px]",
              )}
              placeholder="Rough notes or bullets — the more concrete the better"
              value={value}
              onChange={(e) => updateEntry(i, e.target.value)}
              disabled={isPending}
              maxLength={2000}
            />
            {value.length > 1800 && (
              <p className="mt-1 text-xs text-muted">
                {2000 - value.length} characters remaining
              </p>
            )}
          </div>
        ))}
      </div>

      {softError && (
        <div className="mt-4 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-sm text-warning">
          {softError}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={handleSkip}
          disabled={isPending}
          className="text-sm text-muted underline decoration-border-strong underline-offset-4 hover:text-ink hover:decoration-ink/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Skip for now
        </button>
        <Button onClick={handleSave} disabled={allEmpty || isPending}>
          {isPending ? "Structuring your stories…" : "Save & continue"}
        </Button>
      </div>
    </div>
  );
}
