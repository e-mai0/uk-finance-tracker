"use client";

import { useRef, useState, useTransition } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label, FieldError } from "@/components/ui/input";
import {
  saveApplyProfile,
  uploadCvAction,
  clearCvAction,
} from "@/server/actions/applyProfile";

export interface ApplyProfileInitial {
  phone: string;
  addressCity: string;
  country: string;
  linkedinUrl: string;
  githubUrl: string;
  websiteUrl: string;
  pronouns: string;
  noticePeriod: string;
  earliestStart: string;
  workAuthStatement: string;
  sponsorshipStatement: string;
  selfIdGender: string;
  selfIdEthnicity: string;
  cvFileName: string | null;
  cvFileSize: number | null;
  cvHasText: boolean;
  cvStored: boolean;
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FIELDS: { key: keyof ApplyProfileInitial; label: string; placeholder?: string }[] = [
  { key: "phone", label: "Phone", placeholder: "+44 7…" },
  { key: "addressCity", label: "City", placeholder: "London" },
  { key: "country", label: "Country", placeholder: "United Kingdom" },
  { key: "linkedinUrl", label: "LinkedIn", placeholder: "https://linkedin.com/in/…" },
  { key: "githubUrl", label: "GitHub / portfolio", placeholder: "https://…" },
  { key: "websiteUrl", label: "Website", placeholder: "https://…" },
  { key: "pronouns", label: "Pronouns", placeholder: "she/her" },
  { key: "noticePeriod", label: "Notice period", placeholder: "Available immediately" },
  { key: "earliestStart", label: "Earliest start", placeholder: "June 2027" },
];

export function ApplyProfileForm({ initial }: { initial: ApplyProfileInitial }) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const set = (k: keyof ApplyProfileInitial, v: string) => {
    setState((s) => ({ ...s, [k]: v }));
    setSaved(false);
  };

  const onSave = () => {
    setErrors({});
    startTransition(async () => {
      const res = await saveApplyProfile({
        phone: state.phone,
        addressCity: state.addressCity,
        country: state.country,
        linkedinUrl: state.linkedinUrl,
        githubUrl: state.githubUrl,
        websiteUrl: state.websiteUrl,
        pronouns: state.pronouns,
        noticePeriod: state.noticePeriod,
        earliestStart: state.earliestStart,
        workAuthStatement: state.workAuthStatement,
        sponsorshipStatement: state.sponsorshipStatement,
        selfIdGender: state.selfIdGender,
        selfIdEthnicity: state.selfIdEthnicity,
      });
      if (res.fieldErrors) setErrors(res.fieldErrors);
      else if (res.ok) setSaved(true);
    });
  };

  const onUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("cv", file);
    const res = await uploadCvAction(fd);
    setUploading(false);
    if (res.error) setUploadError(res.error);
    else {
      setState((s) => ({
        ...s,
        cvFileName: file.name,
        cvFileSize: file.size,
        cvStored: true,
        cvHasText: true,
      }));
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onClearCv = () => {
    startTransition(async () => {
      await clearCvAction();
      setState((s) => ({
        ...s,
        cvFileName: null,
        cvFileSize: null,
        cvStored: false,
        cvHasText: false,
      }));
    });
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <div>
          <CardTitle>Apply profile</CardTitle>
          <p className="mt-0.5 text-xs text-muted">
            Details the copilot fills into application forms, and the CV it tailors against.
          </p>
        </div>
        <Button size="sm" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </Button>
      </CardHeader>
      <CardBody className="space-y-5">
        {/* CV upload */}
        <div className="rounded-lg border border-border bg-surface-2/40 p-4">
          <Label>CV / résumé</Label>
          {state.cvStored ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-md bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
                {state.cvFileName}
                {state.cvFileSize ? ` · ${fmtSize(state.cvFileSize)}` : ""}
              </span>
              {!state.cvHasText && (
                <span className="text-xs text-warning">
                  Couldn’t read text — answers will rely on your profile only.
                </span>
              )}
              <button
                type="button"
                onClick={onClearCv}
                className="text-xs font-medium text-danger hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Upload a PDF or Word CV. We extract the text so the copilot can ground
              answers in your real experience. Stored privately.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="block max-w-full text-xs text-muted file:mr-3 file:rounded-pill file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-canvas hover:file:bg-chrome-2"
            />
            <Button size="sm" variant="outline" onClick={onUpload} disabled={uploading}>
              {uploading ? "Uploading…" : state.cvStored ? "Replace" : "Upload"}
            </Button>
          </div>
          {uploadError && <FieldError message={uploadError} />}
        </div>

        {/* Contact + logistics fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                value={state[f.key] as string}
                placeholder={f.placeholder}
                onChange={(e) => set(f.key, e.target.value)}
                className="mt-1"
              />
              <FieldError message={errors[f.key]?.[0]} />
            </div>
          ))}
        </div>

        {/* Work auth statements */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="workAuthStatement">Work-authorisation answer</Label>
            <Textarea
              id="workAuthStatement"
              rows={2}
              value={state.workAuthStatement}
              placeholder="e.g. I have the right to work in the UK with no restrictions."
              onChange={(e) => set("workAuthStatement", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="sponsorshipStatement">Sponsorship answer</Label>
            <Textarea
              id="sponsorshipStatement"
              rows={2}
              value={state.sponsorshipStatement}
              placeholder="e.g. I do not require visa sponsorship now or in the future."
              onChange={(e) => set("sponsorshipStatement", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {/* Optional self-ID */}
        <details className="rounded-lg border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-ink">
            Optional self-identification
          </summary>
          <p className="mt-1 text-xs text-muted">
            Only used to autofill optional diversity questions. Stored only if you fill it in.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="selfIdGender">Gender</Label>
              <Input
                id="selfIdGender"
                value={state.selfIdGender}
                onChange={(e) => set("selfIdGender", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="selfIdEthnicity">Ethnicity</Label>
              <Input
                id="selfIdEthnicity"
                value={state.selfIdEthnicity}
                onChange={(e) => set("selfIdEthnicity", e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </details>
      </CardBody>
    </Card>
  );
}
