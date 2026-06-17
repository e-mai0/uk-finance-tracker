// src/components/cv/cv-empty-state.tsx
// Seam component (U0 refactor): the no-CV state.
// Offers "Build with Cyclops" (draftCvFromKnown) and an "Upload a CV" control
// (file input + uploadCvAction), and owns the post-action handling.
//
// Prop contract:
//   {
//     // Called when a draft succeeds with a non-empty CV. The shell uses this
//     // to flip into the has-CV view and land the user in the refine pane,
//     // matching today's behaviour (set liveCv, hasCv=true, pane="chat").
//     onBuilt: (cv: CvData) => void;
//     // Called when an upload produces a parsed CV. Today the page reloads via
//     // router.refresh() so the server re-renders with the parsed CV; the shell
//     // may also flip state. Behaviour is preserved by calling router.refresh()
//     // here AND notifying the shell.
//     onUploaded: () => void;
//   }
//
// Owned by U0. LATER: U3 edits the upload handler (parallelize + progress) and
// the in-place update path here. Keep the upload UI + handler in this file.
"use client";

import { useState, useCallback, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { draftCvFromKnown } from "@/server/actions/cv";
import { uploadCvAction } from "@/server/actions/applyProfile";
import { isCvEmpty, type CvData } from "@/lib/cv";

export function CvEmptyState({
  onBuilt,
  onUploaded,
}: {
  onBuilt: (cv: CvData) => void;
  onUploaded: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const build = useCallback(() => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await draftCvFromKnown();
      if (res.error) {
        setError(res.error);
        return;
      }
      if (!res.cv || isCvEmpty(res.cv)) {
        setNotice(
          "Cyclops needs a bit more to work with — upload a CV or add your details in Settings first.",
        );
        return;
      }
      onBuilt(res.cv);
      router.refresh();
    });
  }, [onBuilt, router]);

  const upload = useCallback(
    (file: File) => {
      setError(null);
      setNotice(null);
      const formData = new FormData();
      formData.set("cv", file);
      startTransition(async () => {
        const res = await uploadCvAction(formData);
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.cvParsed) {
          onUploaded();
          router.refresh(); // server page reloads with the parsed, editable CV
        } else {
          setNotice(
            'We saved your CV file, but could not turn it into an editable CV right now. Try "Build with Cyclops", or upload again.',
          );
        }
      });
    },
    [onUploaded, router],
  );

  return (
    <div className="animate-rise mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-xl font-bold text-ink">Your CV</h1>
      <p className="text-[0.875rem] text-muted">
        Let Cyclops draft a CV from what it already knows about you, or upload an
        existing one to refine.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm text-muted">{notice}</p>}
      <div className="flex flex-col items-center gap-3">
        <Button variant="primary" onClick={build} disabled={isPending}>
          {isPending ? "Drafting…" : "Build with Cyclops"}
        </Button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isPending}
          className="text-sm text-muted underline decoration-border-strong underline-offset-4 hover:text-ink"
        >
          Upload a CV instead
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          hidden
          onClick={(e) => {
            (e.target as HTMLInputElement).value = "";
          }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
      </div>
    </div>
  );
}
