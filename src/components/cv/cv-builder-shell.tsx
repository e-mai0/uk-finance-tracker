"use client";
// src/components/cv/cv-builder-shell.tsx
// Three-pane layout: 3-step form | live preview | chat.
// The preview updates immediately when the model calls update_cv.
import { useState, useTransition } from "react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import type { CvData, CvFormInput } from "@/lib/cv";
import { cvFormInputSchema, EMPTY_CV } from "@/lib/cv";
import { CvDocument } from "@/components/cv/cv-document";
import { CvChat } from "@/components/cv/cv-chat";
import { buildCv } from "@/server/actions/cv";

// ---------------------------------------------------------------------------
// Step 1: Education
// ---------------------------------------------------------------------------
interface EduRow {
  institution: string;
  qualification: string;
  startYear: string;
  endYear: string;
  grade: string;
  modules: string;
}

const EMPTY_EDU: EduRow = {
  institution: "",
  qualification: "",
  startYear: "",
  endYear: "",
  grade: "",
  modules: "",
};

// ---------------------------------------------------------------------------
// Step 2: Accomplishments
// ---------------------------------------------------------------------------
interface AccRow {
  title: string;
  date: string;
  description: string;
}

const EMPTY_ACC: AccRow = { title: "", date: "", description: "" };

// ---------------------------------------------------------------------------
// Step 3: Projects
// ---------------------------------------------------------------------------
interface ProjRow {
  name: string;
  dates: string;
  skills: string;
  description: string;
  link: string;
}

const EMPTY_PROJ: ProjRow = {
  name: "",
  dates: "",
  skills: "",
  description: "",
  link: "",
};

// ---------------------------------------------------------------------------
// CvBuilderShell
// ---------------------------------------------------------------------------
export function CvBuilderShell({
  initialCv,
  sessionId,
  initialMessages,
}: {
  initialCv: CvData;
  sessionId: string;
  initialMessages: UIMessage[];
}) {
  const [step, setStep] = useState(0);
  const [edu, setEdu] = useState<EduRow[]>([{ ...EMPTY_EDU }]);
  const [acc, setAcc] = useState<AccRow[]>([{ ...EMPTY_ACC }]);
  const [proj, setProj] = useState<ProjRow[]>([{ ...EMPTY_PROJ }]);
  const [cv, setCv] = useState<CvData>(initialCv);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const STEPS = ["Education", "Accomplishments", "Projects"];

  // --- submit handler ---
  function handleSubmit() {
    setSubmitError(null);
    setSubmitSuccess(false);

    const formInput: CvFormInput = cvFormInputSchema.parse({
      education: edu.map((e) => ({
        institution: e.institution,
        qualification: e.qualification,
        startYear: e.startYear || undefined,
        endYear: e.endYear || undefined,
        grade: e.grade || undefined,
        modules: e.modules || undefined,
      })),
      accomplishments: acc.map((a) => ({
        title: a.title,
        date: a.date || undefined,
        description: a.description || undefined,
      })),
      projects: proj.map((p) => ({
        name: p.name,
        dates: p.dates || undefined,
        skills: p.skills || undefined,
        description: p.description || undefined,
        link: p.link || undefined,
      })),
    });

    startTransition(async () => {
      const result = await buildCv(formInput);
      if (result.ok) {
        setSubmitSuccess(true);
      } else {
        setSubmitError(result.error ?? "Something went wrong.");
      }
    });
  }

  // --- row helpers ---
  function addRow<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, empty: T) {
    setter((rows) => [...rows, { ...empty }]);
  }
  function removeRow<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, idx: number) {
    setter((rows) => rows.filter((_, i) => i !== idx));
  }
  function updateRow<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, idx: number, patch: Partial<T>) {
    setter((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const inputCls =
    "w-full border border-border bg-canvas px-2.5 py-1.5 font-mono text-[0.8rem] text-ink placeholder:text-faint focus:border-accent focus:outline-none";
  const labelCls = "block text-[0.75rem] font-bold text-muted mb-0.5";

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Left: Form                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex w-[340px] shrink-0 flex-col border-r border-border bg-surface">
        {/* Stepper header */}
        <div className="flex gap-0 border-b border-border">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                "flex-1 px-3 py-2.5 text-[0.75rem] font-bold transition-colors",
                step === i
                  ? "border-b-2 border-accent text-ink"
                  : "text-muted hover:text-ink",
              )}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* --- Step 1: Education --- */}
          {step === 0 && (
            <div className="space-y-4">
              {edu.map((row, idx) => (
                <div key={idx} className="space-y-2 border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.75rem] font-bold text-muted">
                      Entry {idx + 1}
                    </span>
                    {edu.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(setEdu, idx)}
                        className="text-[0.7rem] text-danger hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Institution</label>
                    <input
                      type="text"
                      value={row.institution}
                      onChange={(e) =>
                        updateRow(setEdu, idx, { institution: e.target.value })
                      }
                      placeholder="Cambridge, Trinity College"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Qualification</label>
                    <input
                      type="text"
                      value={row.qualification}
                      onChange={(e) =>
                        updateRow(setEdu, idx, { qualification: e.target.value })
                      }
                      placeholder="Economics BA"
                      className={inputCls}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Start year</label>
                      <input
                        type="text"
                        value={row.startYear}
                        onChange={(e) =>
                          updateRow(setEdu, idx, { startYear: e.target.value })
                        }
                        placeholder="2025"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>End year</label>
                      <input
                        type="text"
                        value={row.endYear}
                        onChange={(e) =>
                          updateRow(setEdu, idx, { endYear: e.target.value })
                        }
                        placeholder="2028"
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Grade / result</label>
                    <input
                      type="text"
                      value={row.grade}
                      onChange={(e) =>
                        updateRow(setEdu, idx, { grade: e.target.value })
                      }
                      placeholder="Predicted First"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      Modules / coursework / activities
                    </label>
                    <textarea
                      value={row.modules}
                      onChange={(e) =>
                        updateRow(setEdu, idx, { modules: e.target.value })
                      }
                      placeholder={"Microeconomics\nMacroeconomics\nEconometrics"}
                      rows={3}
                      className={cn(inputCls, "resize-none")}
                    />
                    <p className="mt-0.5 font-mono text-[0.6875rem] text-faint">
                      One per line
                    </p>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addRow(setEdu, EMPTY_EDU)}
                className="w-full border border-dashed border-border py-1.5 text-[0.75rem] text-muted hover:border-accent hover:text-accent"
              >
                + Add another
              </button>
            </div>
          )}

          {/* --- Step 2: Accomplishments --- */}
          {step === 1 && (
            <div className="space-y-4">
              {acc.map((row, idx) => (
                <div key={idx} className="space-y-2 border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.75rem] font-bold text-muted">
                      Entry {idx + 1}
                    </span>
                    {acc.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(setAcc, idx)}
                        className="text-[0.7rem] text-danger hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Title</label>
                    <input
                      type="text"
                      value={row.title}
                      onChange={(e) =>
                        updateRow(setAcc, idx, { title: e.target.value })
                      }
                      placeholder="National Economics Prize"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Date (optional)</label>
                    <input
                      type="text"
                      value={row.date}
                      onChange={(e) =>
                        updateRow(setAcc, idx, { date: e.target.value })
                      }
                      placeholder="Jun 2024"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Description (optional)</label>
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) =>
                        updateRow(setAcc, idx, { description: e.target.value })
                      }
                      placeholder="1st place out of 400 entries"
                      className={inputCls}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addRow(setAcc, EMPTY_ACC)}
                className="w-full border border-dashed border-border py-1.5 text-[0.75rem] text-muted hover:border-accent hover:text-accent"
              >
                + Add another
              </button>
            </div>
          )}

          {/* --- Step 3: Projects --- */}
          {step === 2 && (
            <div className="space-y-4">
              {proj.map((row, idx) => (
                <div key={idx} className="space-y-2 border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.75rem] font-bold text-muted">
                      Entry {idx + 1}
                    </span>
                    {proj.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(setProj, idx)}
                        className="text-[0.7rem] text-danger hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Project name</label>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) =>
                        updateRow(setProj, idx, { name: e.target.value })
                      }
                      placeholder="Oxbridge AI Hackathon"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Dates (optional)</label>
                    <input
                      type="text"
                      value={row.dates}
                      onChange={(e) =>
                        updateRow(setProj, idx, { dates: e.target.value })
                      }
                      placeholder="Nov 2024"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Skills / tech (comma-separated)</label>
                    <input
                      type="text"
                      value={row.skills}
                      onChange={(e) =>
                        updateRow(setProj, idx, { skills: e.target.value })
                      }
                      placeholder="Python, SQL, Excel"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Description</label>
                    <textarea
                      value={row.description}
                      onChange={(e) =>
                        updateRow(setProj, idx, { description: e.target.value })
                      }
                      placeholder={"Built a DCF model\nPresented to 50 judges\nWon 1st place"}
                      rows={3}
                      className={cn(inputCls, "resize-none")}
                    />
                    <p className="mt-0.5 font-mono text-[0.6875rem] text-faint">
                      One bullet per line
                    </p>
                  </div>
                  <div>
                    <label className={labelCls}>Link (optional)</label>
                    <input
                      type="url"
                      value={row.link}
                      onChange={(e) =>
                        updateRow(setProj, idx, { link: e.target.value })
                      }
                      placeholder="https://github.com/..."
                      className={inputCls}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addRow(setProj, EMPTY_PROJ)}
                className="w-full border border-dashed border-border py-1.5 text-[0.75rem] text-muted hover:border-accent hover:text-accent"
              >
                + Add another
              </button>
            </div>
          )}
        </div>

        {/* Submit footer */}
        <div className="border-t border-border px-4 py-3">
          {submitError && (
            <p className="mb-2 font-mono text-[0.6875rem] text-danger">
              {submitError}
            </p>
          )}
          {submitSuccess && (
            <p className="mb-2 font-mono text-[0.6875rem] text-accent">
              CV saved. The chatbot and preview are up to date.
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className={cn(
              "w-full border border-border bg-ink px-4 py-2 text-[0.8125rem] font-bold text-canvas transition-colors",
              "hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {isPending ? "Saving…" : "Save & build CV"}
          </button>
          <p className="mt-1.5 font-mono text-[0.6875rem] text-faint">
            Saves your answers and builds the CV. Then use the chat to refine
            it.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Centre: Live preview                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
          <span className="text-[0.75rem] font-bold text-muted">
            Live Preview
          </span>
          <a
            href="/my-cv"
            className="text-[0.75rem] font-bold text-accent hover:underline"
          >
            My CV page
          </a>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <CvDocument cv={cv} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right: Chat                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex w-[360px] shrink-0 flex-col bg-canvas">
        <div className="border-b border-border bg-surface px-4 py-2">
          <span className="text-[0.75rem] font-bold text-muted">
            CV Assistant
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <CvChat
            sessionId={sessionId}
            initialMessages={initialMessages}
            onCvUpdate={(newCv) => setCv(newCv)}
          />
        </div>
      </div>
    </div>
  );
}
