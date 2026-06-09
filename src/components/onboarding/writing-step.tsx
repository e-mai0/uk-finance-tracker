"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { distillVoice } from "@/app/onboarding/cyclops-actions";

interface WritingStepProps {
  onContinue: () => void;
  onSkip: () => void;
}

const PLACEHOLDERS = [
  "e.g. an old cover letter",
  "e.g. a personal statement",
  "e.g. a long email or essay excerpt",
];

export function WritingStep({ onContinue, onSkip }: WritingStepProps) {
  const [samples, setSamples] = useState<[string, string, string]>([
    "",
    "",
    "",
  ]);
  const [softError, setSoftError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allEmpty = samples.every((s) => !s.trim());

  function updateSample(index: number, value: string) {
    setSamples((prev) => {
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
      const res = await distillVoice(samples.filter((s) => s.trim()));
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
        Your writing
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Cyclops learns your voice from these so drafts sound like you, not like
        AI. You can skip and add samples later in chat.
      </p>

      <div className="mt-6 space-y-4">
        {samples.map((value, i) => (
          <div key={i}>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              Sample {i + 1}
              {i === 0 ? "" : " (optional)"}
            </label>
            <textarea
              className={cn(
                "w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-subtle",
                "resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1",
                "min-h-[120px]",
              )}
              placeholder={PLACEHOLDERS[i]}
              value={value}
              onChange={(e) => updateSample(i, e.target.value)}
              disabled={isPending}
              maxLength={4000}
            />
            {value.length > 3800 && (
              <p className="mt-1 text-xs text-muted">
                {4000 - value.length} characters remaining
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
          {isPending ? "Analysing your voice…" : "Save & continue"}
        </Button>
      </div>
    </div>
  );
}
