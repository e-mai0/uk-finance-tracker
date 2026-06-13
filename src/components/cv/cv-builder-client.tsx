// src/components/cv/cv-builder-client.tsx
// Client component for the /cv-builder page. Hosts the 3-step form,
// the CV-chat assistant, and the live CV preview side-by-side.
"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldError } from "@/components/ui/input";
import { CvChat } from "@/components/cv/cv-chat";
import { CvDocument } from "@/components/cv/cv-document";
import { buildCv } from "@/server/actions/cv";
import { cvFormInputSchema, type CvData, type CvFormInput } from "@/lib/cv";
import type { UIMessage } from "ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type EducationRow = CvFormInput["education"][number];
type AccomplishmentRow = CvFormInput["accomplishments"][number];
type ProjectRow = CvFormInput["projects"][number];

const EMPTY_EDU: EducationRow = {
  institution: "",
  qualification: "",
  startYear: "",
  endYear: "",
  grade: "",
  modules: "",
};
const EMPTY_ACCOMPLISHMENT: AccomplishmentRow = {
  title: "",
  date: "",
  description: "",
};
const EMPTY_PROJECT: ProjectRow = {
  name: "",
  dates: "",
  skills: "",
  description: "",
  link: "",
};

const STEPS = ["Education", "Accomplishments", "Projects"] as const;
type Step = (typeof STEPS)[number];

// ---------------------------------------------------------------------------
// Sub-step forms
// ---------------------------------------------------------------------------
function EducationStep({
  rows,
  onChange,
  errors,
}: {
  rows: EducationRow[];
  onChange: (rows: EducationRow[]) => void;
  errors?: Record<string, string>;
}) {
  function setRow(i: number, patch: Partial<EducationRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    onChange([...rows, { ...EMPTY_EDU }]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Add your education history. Start with your current or most recent
        institution.
      </p>
      {rows.map((row, i) => (
        <div
          key={i}
          className="space-y-3 rounded-card border border-border bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <span className="label text-subtle">Entry {i + 1}</span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="label text-danger hover:underline"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor={`edu-inst-${i}`}>Institution</Label>
              <Input
                id={`edu-inst-${i}`}
                value={row.institution}
                onChange={(e) => setRow(i, { institution: e.target.value })}
                placeholder="e.g. University of Cambridge"
              />
              {errors?.[`education.${i}.institution`] && (
                <FieldError message={errors[`education.${i}.institution`]} />
              )}
            </div>
            <div className="col-span-2">
              <Label htmlFor={`edu-qual-${i}`}>Qualification</Label>
              <Input
                id={`edu-qual-${i}`}
                value={row.qualification}
                onChange={(e) => setRow(i, { qualification: e.target.value })}
                placeholder="e.g. Economics BA"
              />
            </div>
            <div>
              <Label htmlFor={`edu-start-${i}`}>Start year</Label>
              <Input
                id={`edu-start-${i}`}
                value={row.startYear ?? ""}
                onChange={(e) => setRow(i, { startYear: e.target.value })}
                placeholder="e.g. 2025"
              />
            </div>
            <div>
              <Label htmlFor={`edu-end-${i}`}>End year</Label>
              <Input
                id={`edu-end-${i}`}
                value={row.endYear ?? ""}
                onChange={(e) => setRow(i, { endYear: e.target.value })}
                placeholder="e.g. 2028"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor={`edu-grade-${i}`}>Grade / result (optional)</Label>
              <Input
                id={`edu-grade-${i}`}
                value={row.grade ?? ""}
                onChange={(e) => setRow(i, { grade: e.target.value })}
                placeholder="e.g. Predicted First"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor={`edu-modules-${i}`}>
                Modules, activities, prizes (optional)
              </Label>
              <Textarea
                id={`edu-modules-${i}`}
                value={row.modules ?? ""}
                onChange={(e) => setRow(i, { modules: e.target.value })}
                placeholder="One item per line, e.g.&#10;Microeconomics&#10;Macroeconomics&#10;Cambridge Union"
                rows={3}
              />
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="label text-accent hover:underline"
      >
        + Add education entry
      </button>
    </div>
  );
}

function AccomplishmentsStep({
  rows,
  onChange,
}: {
  rows: AccomplishmentRow[];
  onChange: (rows: AccomplishmentRow[]) => void;
}) {
  function setRow(i: number, patch: Partial<AccomplishmentRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    onChange([...rows, { ...EMPTY_ACCOMPLISHMENT }]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Add academic prizes, scholarships, competitions, or other achievements.
      </p>
      {rows.map((row, i) => (
        <div
          key={i}
          className="space-y-3 rounded-card border border-border bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <span className="label text-subtle">Entry {i + 1}</span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="label text-danger hover:underline"
              >
                Remove
              </button>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <Label htmlFor={`acc-title-${i}`}>Title</Label>
              <Input
                id={`acc-title-${i}`}
                value={row.title}
                onChange={(e) => setRow(i, { title: e.target.value })}
                placeholder="e.g. Dean's List, British Physics Olympiad Gold"
              />
            </div>
            <div>
              <Label htmlFor={`acc-date-${i}`}>Date (optional)</Label>
              <Input
                id={`acc-date-${i}`}
                value={row.date ?? ""}
                onChange={(e) => setRow(i, { date: e.target.value })}
                placeholder="e.g. 2026"
              />
            </div>
            <div>
              <Label htmlFor={`acc-desc-${i}`}>Description (optional)</Label>
              <Input
                id={`acc-desc-${i}`}
                value={row.description ?? ""}
                onChange={(e) => setRow(i, { description: e.target.value })}
                placeholder="Short description"
              />
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="label text-accent hover:underline"
      >
        + Add accomplishment
      </button>
    </div>
  );
}

function ProjectsStep({
  rows,
  onChange,
}: {
  rows: ProjectRow[];
  onChange: (rows: ProjectRow[]) => void;
}) {
  function setRow(i: number, patch: Partial<ProjectRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    onChange([...rows, { ...EMPTY_PROJECT }]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Add relevant projects, hackathons, research, or competitions.
      </p>
      {rows.map((row, i) => (
        <div
          key={i}
          className="space-y-3 rounded-card border border-border bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <span className="label text-subtle">Entry {i + 1}</span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="label text-danger hover:underline"
              >
                Remove
              </button>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <Label htmlFor={`proj-name-${i}`}>Project name</Label>
              <Input
                id={`proj-name-${i}`}
                value={row.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
                placeholder="e.g. Oxbridge AI Hackathon"
              />
            </div>
            <div>
              <Label htmlFor={`proj-dates-${i}`}>Dates (optional)</Label>
              <Input
                id={`proj-dates-${i}`}
                value={row.dates ?? ""}
                onChange={(e) => setRow(i, { dates: e.target.value })}
                placeholder="e.g. Nov 2026"
              />
            </div>
            <div>
              <Label htmlFor={`proj-skills-${i}`}>
                Skills / technologies (comma-separated, optional)
              </Label>
              <Input
                id={`proj-skills-${i}`}
                value={row.skills ?? ""}
                onChange={(e) => setRow(i, { skills: e.target.value })}
                placeholder="e.g. Python, FastAPI, PostgreSQL"
              />
            </div>
            <div>
              <Label htmlFor={`proj-desc-${i}`}>Description (optional)</Label>
              <Textarea
                id={`proj-desc-${i}`}
                value={row.description ?? ""}
                onChange={(e) => setRow(i, { description: e.target.value })}
                placeholder="One bullet per line, e.g.&#10;Built a real-time application tracker&#10;Won 1st place out of 40 teams"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor={`proj-link-${i}`}>Link (optional)</Label>
              <Input
                id={`proj-link-${i}`}
                value={row.link ?? ""}
                onChange={(e) => setRow(i, { link: e.target.value })}
                placeholder="https://github.com/…"
              />
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="label text-accent hover:underline"
      >
        + Add project
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CvBuilderClient component
// ---------------------------------------------------------------------------
export function CvBuilderClient({
  sessionId,
  initialMessages,
  initialCv,
}: {
  sessionId: string;
  initialMessages: UIMessage[];
  initialCv: CvData;
}) {
  const [step, setStep] = useState(0);
  const [education, setEducation] = useState<EducationRow[]>([
    { ...EMPTY_EDU },
  ]);
  const [accomplishments, setAccomplishments] = useState<AccomplishmentRow[]>([
    { ...EMPTY_ACCOMPLISHMENT },
  ]);
  const [projects, setProjects] = useState<ProjectRow[]>([
    { ...EMPTY_PROJECT },
  ]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Live CV preview — starts with the server-loaded CV, updates via chat
  const [liveCv, setLiveCv] = useState<CvData>(initialCv);

  // Active pane: "form" | "chat" | "preview"
  const [pane, setPane] = useState<"form" | "chat" | "preview">("form");

  function handleCvUpdate(cv: CvData) {
    setLiveCv(cv);
  }

  function handleSubmitForm() {
    setFieldErrors({});
    setSubmitError(null);

    const formInput = { education, accomplishments, projects };
    const parsed = cvFormInputSchema.safeParse(formInput);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const errs: Record<string, string> = {};
      for (const [field, msgs] of Object.entries(flat.fieldErrors)) {
        if (Array.isArray(msgs) && msgs.length > 0) {
          errs[field] = msgs[0]!;
        }
      }
      setFieldErrors(errs);
      return;
    }

    startTransition(async () => {
      const result = await buildCv(parsed.data);
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
      if (result.fieldErrors) {
        const errs: Record<string, string> = {};
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (Array.isArray(msgs) && msgs.length > 0) {
            errs[field] = (msgs as string[])[0]!;
          }
        }
        setFieldErrors(errs);
        return;
      }
      if (result.cv) {
        setLiveCv(result.cv);
      }
      setSubmitSuccess(true);
      // Switch to chat so the user can refine with the assistant
      setPane("chat");
    });
  }

  const isLastFormStep = step === STEPS.length - 1;

  return (
    <div className="animate-rise flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      {/* Pane switcher tabs */}
      <div className="flex items-center gap-1 border-b border-border bg-surface px-4 py-2">
        {(["form", "chat", "preview"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPane(p)}
            className={cn(
              "rounded-pill px-3 py-1 text-[0.8125rem] font-bold capitalize transition-colors",
              pane === p
                ? "bg-ink text-canvas"
                : "text-subtle hover:bg-surface-2 hover:text-ink",
            )}
          >
            {p === "form" ? "Build" : p === "chat" ? "Refine with AI" : "Preview"}
          </button>
        ))}
        {submitSuccess && (
          <span className="ml-auto font-mono text-[0.6875rem] text-accent">
            CV saved
          </span>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {/* ---------------------------------------------------------------- */}
        {/* FORM PANE                                                         */}
        {/* ---------------------------------------------------------------- */}
        {pane === "form" && (
          <div className="flex h-full flex-col overflow-hidden">
            {/* Step tabs */}
            <div className="flex gap-2 border-b border-border px-4 py-2">
              {STEPS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStep(i)}
                  className={cn(
                    "label rounded-pill px-3 py-1 transition-colors",
                    step === i
                      ? "bg-accent-tint text-accent"
                      : i < step
                      ? "text-muted hover:text-ink"
                      : "text-faint",
                  )}
                >
                  <span className="mr-1.5 text-[0.6875rem]">{i + 1}</span>
                  {s}
                </button>
              ))}
            </div>

            {/* Step content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {step === 0 && (
                <EducationStep
                  rows={education}
                  onChange={setEducation}
                  errors={fieldErrors}
                />
              )}
              {step === 1 && (
                <AccomplishmentsStep
                  rows={accomplishments}
                  onChange={setAccomplishments}
                />
              )}
              {step === 2 && (
                <ProjectsStep rows={projects} onChange={setProjects} />
              )}

              {submitError && (
                <p className="mt-3 text-sm text-danger">{submitError}</p>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                Back
              </Button>
              {isLastFormStep ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmitForm}
                  disabled={isPending}
                >
                  {isPending ? "Building…" : "Build my CV"}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                >
                  Next
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* CHAT PANE                                                         */}
        {/* ---------------------------------------------------------------- */}
        {pane === "chat" && (
          <CvChat
            key={sessionId}
            sessionId={sessionId}
            initialMessages={initialMessages}
            onCvUpdate={handleCvUpdate}
          />
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PREVIEW PANE                                                      */}
        {/* ---------------------------------------------------------------- */}
        {pane === "preview" && (
          <div className="h-full overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-2xl rounded-card border border-border bg-surface p-6 shadow-card">
              <CvDocument cv={liveCv} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
