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
//     // Called when an upload produces a parsed CV. The parsed CvData is lifted
//     // up so <CvPageClient> flips into the has-CV shell IN PLACE — no full page
//     // reload (router.refresh). Mirrors onBuilt(cv) for the draft path.
//     onUploaded: (cv: CvData) => void;
//   }
//
// Owned by U0. U3 owns the upload handler (parallelize lives server-side; this
// file shows ONE honest in-flight working state tied to the awaited action) and
// the in-place update path (lift the parsed cv up; no router.refresh).
"use client";

import { useState, useCallback, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { draftCvFromKnown } from "@/server/actions/cv";
import { uploadCvAction } from "@/server/actions/applyProfile";
import { isCvEmpty, type CvData } from "@/lib/cv";
import type { UIMessage } from "ai";

export function CvEmptyState({
  onBuilt,
  onUploaded,
}: {
  onBuilt: (cv: CvData) => void;
  // F2: the parsed CV plus the seeded coach-opening message (assessment + 3
  // chips), so the parent can flip into the has-CV shell AND seed the chat with
  // the opening in place — the headline "upload → get coached" moment renders
  // immediately, with no full reload (router.refresh) and no refetch.
  onUploaded: (cv: CvData, coachOpening?: UIMessage) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Honest, single working state: true ONLY while the upload server action is
  // actually in flight (set right before the await, cleared when it resolves).
  // No timers, no fake multi-step animation — it reflects the one real awaited
  // milestone (parse + persist + coach-seed happen inside that one call).
  const [uploading, setUploading] = useState(false);
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
      setUploading(true);
      startTransition(async () => {
        try {
          const res = await uploadCvAction(formData);
          if (res.error) {
            setError(res.error);
            return;
          }
          if (res.cvParsed && res.cv) {
            // In-place transition: hand the parsed CV up so the page flips into
            // the has-CV shell without a full reload. No router.refresh().
            // F2: also hand up the seeded coach opening (assessment + chips) so
            // the chat shows it immediately on the transition. It may be absent
            // if seeding failed; the chat then simply opens empty (as before).
            onUploaded(res.cv, res.coachOpening as UIMessage | undefined);
          } else {
            setNotice(
              'We saved your CV file, but could not turn it into an editable CV right now. Try "Build with Cyclops", or upload again.',
            );
          }
        } finally {
          setUploading(false);
        }
      });
    },
    [onUploaded],
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
      {/* Honest, single working state: shown ONLY while the upload action is
          actually awaited. It is replaced by the populated has-CV shell when the
          real work resolves — no timed/fake step animation. */}
      {uploading && (
        <p
          role="status"
          aria-live="polite"
          className="animate-pulse text-sm text-muted"
        >
          Reading your CV…
        </p>
      )}
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
          {uploading ? "Reading your CV…" : "Upload a CV instead"}
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
