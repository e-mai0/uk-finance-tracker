"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { RoleFamily, WorkAuth } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ToggleChipGroup } from "@/components/ui/toggle-chip";
import { TagInput } from "@/components/ui/tag-input";
import { cn } from "@/lib/utils";
import {
  DEGREE_TYPES,
  ROLE_FAMILIES,
  ROLE_FAMILY_LABEL,
  UK_LOCATIONS,
  UK_UNIVERSITIES,
  WORK_AUTH_OPTIONS,
  WORK_AUTH_LABEL,
} from "@/lib/constants";
import {
  educationSchema,
  interestsSchema,
  eligibilitySchema,
} from "@/lib/validation";
import { completeOnboarding } from "@/server/actions/onboarding";
import { WritingStep } from "@/components/onboarding/writing-step";
import { StoriesStep } from "@/components/onboarding/stories-step";

type Errors = Record<string, string[] | undefined>;

interface WizardState {
  university: string;
  degreeSubject: string;
  degreeType: string;
  graduationYear: string;
  currentYear: string;
  targetRoleFamilies: RoleFamily[];
  skills: string[];
  workAuth: WorkAuth | "";
  aLevels: string;
  gcseSummary: string;
  gpaOrEquivalent: string;
  preferredLocations: string[];
  openToAnywhereUk: boolean;
  targetEmployers: string[];
  cvFileName: string;
  cvFileSize?: number;
}

const STORAGE_KEY = "trackr.onboarding.v1";

const EMPTY: WizardState = {
  university: "",
  degreeSubject: "",
  degreeType: "",
  graduationYear: "",
  currentYear: "",
  targetRoleFamilies: [],
  skills: [],
  workAuth: "",
  aLevels: "",
  gcseSummary: "",
  gpaOrEquivalent: "",
  preferredLocations: [],
  openToAnywhereUk: false,
  targetEmployers: [],
  cvFileName: "",
};

const STEPS = [
  "Welcome",
  "Education",
  "Interests",
  "Eligibility",
  "Targets",
  "Review",
  "Your writing",
  "Your stories",
] as const;

const SKILL_SUGGESTIONS = [
  "Excel",
  "Valuation",
  "Modelling",
  "Python",
  "Accounting",
  "Statistics",
  "Probability",
  "SQL",
  "Equity research",
  "Trading",
];

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
  const [state, setState] = useState<WizardState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Restore any in-progress draft.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Autosave progress between steps.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  function validateStep(current: number): boolean {
    setErrors({});
    if (current === 1) {
      const r = educationSchema.safeParse({
        university: state.university,
        degreeSubject: state.degreeSubject,
        degreeType: state.degreeType,
        graduationYear: Number(state.graduationYear),
        currentYear: Number(state.currentYear),
      });
      if (!r.success) {
        setErrors(r.error.flatten().fieldErrors);
        return false;
      }
    }
    if (current === 2) {
      const r = interestsSchema.safeParse({
        targetRoleFamilies: state.targetRoleFamilies,
        skills: state.skills,
      });
      if (!r.success) {
        setErrors(r.error.flatten().fieldErrors);
        return false;
      }
    }
    if (current === 3) {
      const r = eligibilitySchema.safeParse({
        workAuth: state.workAuth,
        gradeInfo: {
          aLevels: state.aLevels,
          gcseSummary: state.gcseSummary,
          gpaOrEquivalent: state.gpaOrEquivalent,
        },
      });
      if (!r.success) {
        setErrors(r.error.flatten().fieldErrors);
        return false;
      }
    }
    if (current === 4) {
      if (!state.openToAnywhereUk && state.preferredLocations.length === 0) {
        setErrors({
          preferredLocations: [
            "Pick at least one location, or select 'open to anywhere in the UK'.",
          ],
        });
        return false;
      }
    }
    return true;
  }

  function next() {
    if (validateStep(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  function finish() {
    setSubmitError(null);
    const payload = {
      university: state.university,
      degreeSubject: state.degreeSubject,
      degreeType: state.degreeType,
      graduationYear: Number(state.graduationYear),
      currentYear: Number(state.currentYear),
      targetRoleFamilies: state.targetRoleFamilies,
      skills: state.skills,
      workAuth: state.workAuth,
      gradeInfo: {
        aLevels: state.aLevels,
        gcseSummary: state.gcseSummary,
        gpaOrEquivalent: state.gpaOrEquivalent,
      },
      preferredLocations: state.preferredLocations,
      openToAnywhereUk: state.openToAnywhereUk,
      targetEmployers: state.targetEmployers,
      cvFileName: state.cvFileName,
      cvFileSize: state.cvFileSize,
    };

    startTransition(async () => {
      const res = await completeOnboarding(payload);
      if (res.error) {
        setSubmitError(res.error);
        return;
      }
      if (res.fieldErrors) {
        setSubmitError(
          "Some details need a second look — please review the earlier steps.",
        );
        return;
      }
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      await update({ onboarded: true });
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Stepper step={step} />

      <div className="mt-8 rounded-[var(--radius-card)] border border-border bg-surface p-6 sm:p-8">
        {step === 0 && (
          <StepShell
            title={`Welcome, ${firstName}`}
            subtitle="Let's set up your tracker. This takes about two minutes and powers your personalized fit scores. You can change anything later in Settings."
          >
            <ul className="space-y-2.5 text-sm text-muted">
              {[
                "Tell us about your degree and timing",
                "Pick the areas of finance you're targeting",
                "Confirm your eligibility and preferences",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-[0.7rem] font-bold text-accent">
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </StepShell>
        )}

        {step === 1 && (
          <StepShell
            title="Your education"
            subtitle="This helps us judge timing and eligibility for each programme."
          >
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell
            title="What are you targeting?"
            subtitle="Pick every area you'd consider. We weight matching roles more heavily."
          >
            <div>
              <Label>Role families</Label>
              <div className="mt-2">
                <ToggleChipGroup
                  options={ROLE_FAMILIES.map((r) => ({
                    value: r.value,
                    label: r.label,
                  }))}
                  selected={state.targetRoleFamilies}
                  onChange={(v) => set("targetRoleFamilies", v)}
                />
              </div>
              <FieldError message={errors.targetRoleFamilies?.[0]} />
            </div>

            <div className="mt-6">
              <Label>Skills &amp; interests</Label>
              <p className="mb-2 mt-1 text-xs text-muted">
                Add a few — they give roles a small relevance boost. Press Enter
                to add.
              </p>
              <TagInput
                value={state.skills}
                onChange={(v) => set("skills", v)}
                suggestions={SKILL_SUGGESTIONS}
                placeholder="e.g. Excel, valuation, Python"
                max={20}
              />
            </div>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell
            title="Eligibility"
            subtitle="Work authorization shapes which roles are realistic. Academic details are optional."
          >
            <div>
              <Label>UK work authorization</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {WORK_AUTH_OPTIONS.map((o) => {
                  const active = state.workAuth === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set("workAuth", o.value)}
                      className={cn(
                        "rounded-lg border px-3.5 py-2.5 text-left text-sm font-medium transition-colors",
                        active
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border-strong bg-surface text-muted hover:border-ink/30 hover:text-ink",
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <FieldError message={errors.workAuth?.[0]} />
            </div>

            <div className="mt-6">
              <Label>Academic details (optional)</Label>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <Input
                  value={state.aLevels}
                  onChange={(e) => set("aLevels", e.target.value)}
                  placeholder="A-levels e.g. A*A*A"
                />
                <Input
                  value={state.gcseSummary}
                  onChange={(e) => set("gcseSummary", e.target.value)}
                  placeholder="GCSEs e.g. 9 A*/9s"
                />
                <Input
                  value={state.gpaOrEquivalent}
                  onChange={(e) => set("gpaOrEquivalent", e.target.value)}
                  placeholder="Degree grade / GPA"
                />
              </div>
            </div>
          </StepShell>
        )}

        {step === 4 && (
          <StepShell
            title="Preferences & targets"
            subtitle="Where you want to be and which firms you're aiming at."
          >
            <div>
              <Label>Preferred UK locations</Label>
              <div className="mt-2">
                <ToggleChipGroup
                  options={UK_LOCATIONS.map((l) => ({ value: l, label: l }))}
                  selected={state.preferredLocations}
                  onChange={(v) => set("preferredLocations", v)}
                />
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={state.openToAnywhereUk}
                  onChange={(e) => set("openToAnywhereUk", e.target.checked)}
                  className="h-4 w-4 rounded border-border-strong accent-[var(--color-accent)]"
                />
                I&apos;m open to roles anywhere in the UK
              </label>
              <FieldError message={errors.preferredLocations?.[0]} />
            </div>

            <div className="mt-6">
              <Label>Target employers (optional)</Label>
              <p className="mb-2 mt-1 text-xs text-muted">
                Roles at these firms get a fit boost. Press Enter to add.
              </p>
              <TagInput
                value={state.targetEmployers}
                onChange={(v) => set("targetEmployers", v)}
                suggestions={employerSuggestions}
                placeholder="e.g. Goldman Sachs, Blackstone"
              />
            </div>

            <div className="mt-6">
              <Label htmlFor="cv">CV (optional)</Label>
              <p className="mb-2 mt-1 text-xs text-muted">
                We note the file name now; upload the actual CV later in Settings
                so the apply copilot can tailor to it.
              </p>
              <input
                id="cv"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  set("cvFileName", f?.name ?? "");
                  set("cvFileSize", f?.size);
                }}
                className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-2"
              />
              {state.cvFileName && (
                <p className="mt-1.5 text-xs text-success">
                  Attached: {state.cvFileName}
                </p>
              )}
            </div>
          </StepShell>
        )}

        {step === 5 && (
          <StepShell
            title="Review & finish"
            subtitle="Confirm everything looks right. We'll build your matches instantly."
          >
            <dl className="divide-y divide-border rounded-lg border border-border">
              <Row label="Name" value={firstName} />
              <Row
                label="Education"
                value={`${state.degreeType} ${state.degreeSubject} · ${state.university}`}
              />
              <Row
                label="Timing"
                value={`Year ${state.currentYear || "—"} · graduating ${state.graduationYear || "—"}`}
              />
              <Row
                label="Targeting"
                value={
                  state.targetRoleFamilies
                    .map((r) => ROLE_FAMILY_LABEL[r])
                    .join(", ") || "—"
                }
              />
              <Row
                label="Work auth"
                value={state.workAuth ? WORK_AUTH_LABEL[state.workAuth] : "—"}
              />
              <Row
                label="Locations"
                value={
                  state.openToAnywhereUk
                    ? "Anywhere in the UK"
                    : state.preferredLocations.join(", ") || "—"
                }
              />
              <Row
                label="Target firms"
                value={state.targetEmployers.join(", ") || "None specified"}
              />
            </dl>

            {submitError && (
              <div className="mt-4 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
                {submitError}
              </div>
            )}
          </StepShell>
        )}

        {step === 6 && (
          <WritingStep onContinue={next} onSkip={next} />
        )}

        {step === 7 && (
          <StoriesStep onContinue={finish} onSkip={finish} />
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === 0 || isPending}
            className={step === 0 ? "invisible" : ""}
          >
            Back
          </Button>
          {/* Steps 0–5 use the shared bottom navigation */}
          {step < 5 && (
            <Button onClick={next}>
              {step === 0 ? "Get started" : "Continue"}
            </Button>
          )}
          {step === 5 && (
            <Button onClick={next} disabled={isPending}>
              Continue
            </Button>
          )}
          {/* Steps 6–7 manage their own primary CTA and skip link internally */}
        </div>
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

function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
