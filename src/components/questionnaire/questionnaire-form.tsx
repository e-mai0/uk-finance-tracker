"use client";

import { useState, useTransition } from "react";
import type { WorkAuth } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { ToggleChipGroup } from "@/components/ui/toggle-chip";
import { TagInput } from "@/components/ui/tag-input";
import { cn } from "@/lib/utils";
import { UK_LOCATIONS, WORK_AUTH_OPTIONS } from "@/lib/constants";
import { saveQuestionnaire } from "@/server/actions/questionnaire";
import { distillVoice, seedStories } from "@/app/onboarding/cyclops-actions";

export interface QuestionnaireInitial {
  workAuth: WorkAuth | null;
  aLevels: string;
  gcseSummary: string;
  gpaOrEquivalent: string;
  skills: string[];
  preferredLocations: string[];
  openToAnywhereUk: boolean;
  targetEmployers: string[];
}

export const EMPTY_QUESTIONNAIRE: QuestionnaireInitial = {
  workAuth: null,
  aLevels: "",
  gcseSummary: "",
  gpaOrEquivalent: "",
  skills: [],
  preferredLocations: [],
  openToAnywhereUk: true,
  targetEmployers: [],
};

const SKILL_SUGGESTIONS = [
  "Excel", "Valuation", "Modelling", "Python", "Accounting",
  "Statistics", "Probability", "SQL", "Equity research", "Trading",
];

const WRITING_PLACEHOLDERS = [
  "e.g. an old cover letter",
  "e.g. a personal statement",
  "e.g. a long email or essay excerpt",
];

const STORY_PROMPTS = [
  "A time you led something…",
  "A time something went wrong…",
  "Something you built, analysed, or achieved…",
];

export function QuestionnaireForm({
  initial,
  employerSuggestions,
  variant,
  onDone,
}: {
  initial: QuestionnaireInitial;
  employerSuggestions: string[];
  variant: "onboarding" | "settings";
  onDone?: () => void;
}) {
  const [s, setS] = useState(initial);
  const [writingSamples, setWritingSamples] = useState<string[]>(["", "", ""]);
  const [storyEntries, setStoryEntries] = useState<string[]>(["", "", ""]);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof QuestionnaireInitial>(
    key: K,
    value: QuestionnaireInitial[K],
  ) => setS((prev) => ({ ...prev, [key]: value }));

  const setListItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string,
  ) => setter((prev) => prev.map((v, i) => (i === index ? value : v)));

  function save() {
    setErrors({});
    setMessage(null);
    const payload = {
      workAuth: s.workAuth,
      gradeInfo: {
        aLevels: s.aLevels,
        gcseSummary: s.gcseSummary,
        gpaOrEquivalent: s.gpaOrEquivalent,
      },
      skills: s.skills,
      preferredLocations: s.preferredLocations,
      openToAnywhereUk: s.openToAnywhereUk,
      targetEmployers: s.targetEmployers,
    };

    startTransition(async () => {
      const res = await saveQuestionnaire(payload);
      if (res.fieldErrors) {
        setErrors(res.fieldErrors);
        setMessage("Please fix the highlighted fields.");
        return;
      }
      if (res.error) {
        setMessage(res.error);
        return;
      }
      if (variant === "onboarding") {
        // Voice + stories are best-effort: failures never block finishing, and
        // neither may a slow or hanging LLM call. These are server actions that
        // finish server-side even after we navigate, so cap the wait and move on
        // regardless — otherwise a stuck call strands the user in the wizard.
        const samples = writingSamples.filter((v) => v.trim());
        const stories = storyEntries.filter((v) => v.trim());
        let aiNotice: string | null = null;
        const best = (async () => {
          if (samples.length) {
            // Voice-distill can fail (e.g. no AI credit). Surface its friendly,
            // non-blocking notice; never let it throw or block finishing.
            const res = await distillVoice(samples).catch(() => null);
            if (res && !res.ok && res.message) aiNotice = res.message;
          }
          if (stories.length) await seedStories(stories).catch(() => null);
        })();
        await Promise.race([
          best,
          new Promise((resolve) => setTimeout(resolve, 10000)),
        ]);
        if (aiNotice) setMessage(aiNotice);
        onDone?.();
        return;
      }
      setMessage("Saved. Your matches have been recalculated.");
      onDone?.();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Label>UK work authorization</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {WORK_AUTH_OPTIONS.map((o) => {
            const active = s.workAuth === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => set("workAuth", active ? null : o.value)}
                className={cn(
                  // Selection is ink — never amber (GB+ contract).
                  "rounded-[var(--radius-control)] border px-3.5 py-2.5 text-left text-[0.8125rem] font-bold transition-colors",
                  active
                    ? "border-ink bg-surface-3 text-ink"
                    : "border-border-interactive bg-surface text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <FieldError message={errors.workAuth?.[0]} />
      </div>

      <div>
        <Label>Academic details</Label>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Input
            value={s.aLevels}
            onChange={(e) => set("aLevels", e.target.value)}
            placeholder="A-levels e.g. A*A*A"
            maxLength={120}
          />
          <Input
            value={s.gcseSummary}
            onChange={(e) => set("gcseSummary", e.target.value)}
            placeholder="GCSEs e.g. 9 A*/9s"
            maxLength={120}
          />
          <Input
            value={s.gpaOrEquivalent}
            onChange={(e) => set("gpaOrEquivalent", e.target.value)}
            placeholder="Degree grade / GPA"
            maxLength={60}
          />
        </div>
      </div>

      <div>
        <Label>Skills &amp; interests</Label>
        <p className="mb-2 mt-1 text-xs text-muted">
          They give roles a small relevance boost. Press Enter to add.
        </p>
        <TagInput
          value={s.skills}
          onChange={(v) => set("skills", v)}
          suggestions={SKILL_SUGGESTIONS}
          placeholder="e.g. Excel, valuation, Python"
          max={20}
        />
        <FieldError message={errors.skills?.[0]} />
      </div>

      <div>
        <Label>Preferred UK locations</Label>
        <div className="mt-2">
          <ToggleChipGroup
            options={UK_LOCATIONS.map((l) => ({ value: l, label: l }))}
            selected={s.preferredLocations}
            onChange={(v) => set("preferredLocations", v)}
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={s.openToAnywhereUk}
            onChange={(e) => set("openToAnywhereUk", e.target.checked)}
            className="h-4 w-4 rounded border-border-interactive accent-[var(--color-ink)]"
          />
          I&apos;m open to roles anywhere in the UK
        </label>
        <FieldError message={errors.preferredLocations?.[0]} />
      </div>

      <div>
        <Label>Target employers</Label>
        <p className="mb-2 mt-1 text-xs text-muted">
          Roles at these firms get a fit boost. Press Enter to add.
        </p>
        <TagInput
          value={s.targetEmployers}
          onChange={(v) => set("targetEmployers", v)}
          suggestions={employerSuggestions}
          placeholder="e.g. Goldman Sachs, Blackstone"
          max={40}
        />
        <FieldError message={errors.targetEmployers?.[0]} />
      </div>

      {variant === "onboarding" && (
        <>
          <details className="rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Your writing (optional) — drafts will sound like you, not like AI
            </summary>
            <div className="mt-4 space-y-3">
              {writingSamples.map((value, i) => (
                <textarea
                  key={i}
                  className={cn(
                    "w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-subtle",
                    "min-h-[100px] resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  )}
                  placeholder={WRITING_PLACEHOLDERS[i]}
                  value={value}
                  onChange={(e) => setListItem(setWritingSamples, i, e.target.value)}
                  disabled={pending}
                  maxLength={4000}
                />
              ))}
            </div>
          </details>

          <details className="rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Your stories (optional) — real anecdotes make answers human
            </summary>
            <div className="mt-4 space-y-3">
              {storyEntries.map((value, i) => (
                <div key={i}>
                  <label className="mb-1.5 block text-sm font-medium text-ink">
                    {STORY_PROMPTS[i]}
                  </label>
                  <textarea
                    className={cn(
                      "w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-subtle",
                      "min-h-[80px] resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                    )}
                    placeholder="Rough notes or bullets — the more concrete the better"
                    value={value}
                    onChange={(e) => setListItem(setStoryEntries, i, e.target.value)}
                    disabled={pending}
                    maxLength={2000}
                  />
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "text-sm",
            message?.startsWith("Saved") ? "text-success" : "text-muted",
          )}
        >
          {message}
        </span>
        <Button onClick={save} disabled={pending}>
          {pending
            ? "Saving…"
            : variant === "onboarding"
              ? "Save & finish"
              : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
