"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { uploadCvAction } from "@/server/actions/applyProfile";

export function CvStep({ onContinue }: { onContinue: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [pending, startTransition] = useTransition();

  function upload() {
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.set("cv", file);
    startTransition(async () => {
      const res = await uploadCvAction(formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      setUploaded(true);
    });
  }

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight text-ink">
        Upload your CV
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Upload your CV, or have Cyclops build one for you on the CV page — it
        already knows your basics. PDF or Word, up to 10&nbsp;MB. You can also
        do this later in Settings.
      </p>

      <div className="mt-6">
        <Label htmlFor="cv">CV file</Label>
        <input
          id="cv"
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          disabled={pending || uploaded}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-2"
        />
        {uploaded && (
          <p className="mt-2 text-sm text-success">
            Uploaded: {file?.name} — we&apos;ve read it and noted the highlights.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {uploaded ? (
          <Button onClick={onContinue}>Continue</Button>
        ) : (
          <>
            <Button onClick={upload} disabled={!file || pending}>
              {pending ? "Uploading…" : "Upload CV"}
            </Button>
            <button
              type="button"
              onClick={onContinue}
              disabled={pending}
              className="text-sm font-medium text-ink underline decoration-border-strong underline-offset-4 hover:decoration-ink/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Build one with Cyclops later
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={pending}
              className="text-sm text-muted underline decoration-border-strong underline-offset-4 hover:text-ink hover:decoration-ink/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Skip for now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
