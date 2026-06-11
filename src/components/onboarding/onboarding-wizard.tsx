"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { RoleFamily } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ToggleChipGroup } from "@/components/ui/toggle-chip";
import { cn } from "@/lib/utils";
import {
  DEGREE_TYPES,
  ROLE_FAMILIES,
  UK_UNIVERSITIES,
} from "@/lib/constants";
import { essentialsSchema } from "@/lib/validation";
import { completeOnboarding } from "@/server/actions/onboarding";
import { CvStep } from "@/components/onboarding/cv-step";
import {
  QuestionnaireForm,
  EMPTY_QUESTIONNAIRE,
} from "@/components/questionnaire/questionnaire-form";

interface EssentialsState {
  university: string;
  degreeSubject: string;
  degreeType: string;
  graduationYear: string;
  currentYear: string;
  targetRoleFamilies: RoleFamily[];
}

const STORAGE_KEY = "trackr.onboarding.v2";

const EMPTY: EssentialsState = {
  university: "",
  degreeSubject: "",
  degreeType: "",
  graduationYear: "",
  currentYear: "",
  targetRoleFamilies: [],
};

const STEPS = ["Essentials", "Your CV", "More about you"] as const;

const YEAR_OPTIONS = ["2026", "2027", "2028", "2029", "2030", "2031"];

export function OnboardingWizard({
  firstName,
  employerSuggestions,
}: {
  firstName: string;
  employerSuggestions: string[];
}) {
  const router = useRouter();
  const { update } = useSession();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<EssentialsState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Restore any in-progress draft of the essentials step.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const set = <K extends keyof EssentialsState>(key: K, value: EssentialsState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  /** Step 0 submit: validates, completes onboarding, then unlocks steps 1–2. */
  function submitEssentials() {
    setErrors({});
    setSubmitError(null);
    const payload = {
      university: state.university,
      degreeSubject: state.degreeSubject,
      degreeType: state.degreeType,
      graduationYear: Number(state.graduationYear),
      currentYear: Number(state.currentYear),
      targetRoleFamilies: state.targetRoleFamilies,
    };
    const r = essentialsSchema.safeParse(payload);
    if (!r.success) {
      setErrors(r.error.flatten().fieldErrors);
      return;
    }

    startTransition(async () => {
      const res = await completeOnboarding(payload);
      if (res.error || res.fieldErrors) {
        setSubmitError(res.error ?? "Some details need a second look.");
        if (res.fieldErrors) setErrors(res.fieldErrors);
        return;
      }
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      // Session flips to onboarded now; user is done even if they bail here.
      await update({ onboarded: true });
      setStep(1);
    });
  }

  function goToDashboard() {
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Stepper step={step} />

      <div className="mt-8 rounded-[var(--radius-card)] border border-border bg-surface p-6 sm:p-8">
        {step === 0 && (
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Welcome, {firstName}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Six quick answers and your personalized fit scores go live. You
              can change anything later in Settings.
            </p>

            {submitError && (
              <div className="mt-4 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
                {submitError}
              </div>
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="university">University</Label>
                <Input
                  id="university"
                  list="uni-list"
                  className="mt-1.5"
                  value={state.university}
                  onChange={(e) => set("university", e.target.value)}
                  placeholder="University of Cambridge"
                />
                <datalist id="uni-list">
                  {UK_UNIVERSITIES.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
                <FieldError message={errors.university?.[0]} />
              </div>

              <div>
                <Label htmlFor="subject">Degree subject</Label>
                <Input
                  id="subject"
                  className="mt-1.5"
                  value={state.degreeSubject}
                  onChange={(e) => set("degreeSubject", e.target.value)}
                  placeholder="Economics"
                />
                <FieldError message={errors.degreeSubject?.[0]} />
              </div>

              <div>
                <Label htmlFor="degreeType">Degree type</Label>
                <Select
                  id="degreeType"
                  className="mt-1.5"
                  value={state.degreeType}
                  onChange={(e) => set("degreeType", e.target.value)}
                >
                  <option value="">Select…</option>
                  {DEGREE_TYPES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
                <FieldError message={errors.degreeType?.[0]} />
              </div>

              <div>
                <Label htmlFor="gradYear">Graduation year</Label>
                <Select
                  id="gradYear"
                  className="mt-1.5"
                  value={state.graduationYear}
                  onChange={(e) => set("graduationYear", e.target.value)}
                >
                  <option value="">Select…</option>
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
                <FieldError message={errors.graduationYear?.[0]} />
              </div>

              <div>
                <Label htmlFor="currentYear">Current year of study</Label>
                <Select
                  id="currentYear"
                  className="mt-1.5"
                  value={state.currentYear}
                  onChange={(e) => set("currentYear", e.target.value)}
                >
                  <option value="">Select…</option>
                  {[1, 2, 3, 4, 5].map((y) => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </Select>
                <FieldError message={errors.currentYear?.[0]} />
              </div>

              <div className="sm:col-span-2">
                <Label>What are you targeting?</Label>
                <p className="mb-2 mt-1 text-xs text-muted">
                  Pick every area you&apos;d consider — matching roles are
                  weighted more heavily.
                </p>
                <ToggleChipGroup
                  options={ROLE_FAMILIES.map((r) => ({
                    value: r.value,
                    label: r.label,
                  }))}
                  selected={state.targetRoleFamilies}
                  onChange={(v) => set("targetRoleFamilies", v)}
                />
                <FieldError message={errors.targetRoleFamilies?.[0]} />
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <Button onClick={submitEssentials} disabled={isPending}>
                {isPending ? "Setting up…" : "Create my tracker"}
              </Button>
            </div>
          </div>
        )}

        {step === 1 && <CvStep onContinue={() => setStep(2)} />}

        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              More about you
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              All optional — each answer sharpens your matches and drafts. Skip
              now and update any of it later in Settings.
            </p>
            <div className="mt-6">
              <QuestionnaireForm
                initial={EMPTY_QUESTIONNAIRE}
                employerSuggestions={employerSuggestions}
                variant="onboarding"
                onDone={goToDashboard}
              />
            </div>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={goToDashboard}
                className="text-sm text-muted underline decoration-border-strong underline-offset-4 hover:text-ink hover:decoration-ink/40"
              >
                Skip for now — take me to my dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 flex-col gap-1.5">
          <div
            className={cn(
              "h-1 rounded-full transition-colors",
              i <= step ? "bg-accent" : "bg-border",
            )}
          />
          <span
            className={cn(
              "hidden text-[0.7rem] font-medium sm:block",
              i === step ? "text-ink" : "text-subtle",
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
