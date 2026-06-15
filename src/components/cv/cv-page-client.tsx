// src/components/cv/cv-page-client.tsx
// Unified CV client. Two states:
//  - empty  → Build with Cyclops (AI draft) / Upload a CV
//  - has CV → document + Refine-with-Cyclops chat + downloads
// v1 is chat + confirm only — no direct field editing.
"use client";

import { useState, useCallback, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CvChat } from "@/components/cv/cv-chat";
import { CvDocument } from "@/components/cv/cv-document";
import { draftCvFromKnown } from "@/server/actions/cv";
import { uploadCvAction } from "@/server/actions/applyProfile";
import { isCvEmpty, type CvData } from "@/lib/cv";
import type { UIMessage } from "ai";

export function CvPageClient({
  sessionId,
  initialMessages,
  initialCv,
  initialHasCv,
}: {
  sessionId: string;
  initialMessages: UIMessage[];
  initialCv: CvData;
  initialHasCv: boolean;
}) {
  const router = useRouter();
  const [liveCv, setLiveCv] = useState<CvData>(initialCv);
  const [hasCv, setHasCv] = useState(initialHasCv);
  const [pane, setPane] = useState<"preview" | "chat">("preview");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCvUpdate = useCallback((cv: CvData) => {
    setLiveCv(cv);
    setHasCv(true);
  }, []);

  function build() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await draftCvFromKnown();
      if (res.error) { setError(res.error); return; }
      if (!res.cv || isCvEmpty(res.cv)) {
        setNotice("Cyclops needs a bit more to work with — upload a CV or add your details in Settings first.");
        return;
      }
      setLiveCv(res.cv);
      setHasCv(true);
      setPane("chat");
      router.refresh();
    });
  }

  function upload(file: File) {
    setError(null);
    setNotice(null);
    const formData = new FormData();
    formData.set("cv", file);
    startTransition(async () => {
      const res = await uploadCvAction(formData);
      if (res.error) { setError(res.error); return; }
      if (res.cvParsed) {
        router.refresh(); // server page reloads with the parsed, editable CV
      } else {
        setNotice(
          "We saved your CV file, but could not turn it into an editable CV right now. Try \"Build with Cyclops\", or upload again."
        );
      }
    });
  }

  // ----- Empty state -----
  if (!hasCv) {
    return (
      <div className="animate-rise mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-24 text-center">
        <h1 className="text-xl font-bold text-ink">Your CV</h1>
        <p className="text-[0.875rem] text-muted">
          Let Cyclops draft a CV from what it already knows about you, or upload an existing one to refine.
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
            onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
          />
        </div>
      </div>
    );
  }

  // ----- Has-CV state -----
  return (
    <div className="animate-rise flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-border bg-surface px-4 py-2">
        {(["preview", "chat"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPane(p)}
            className={cn(
              "rounded-pill px-3 py-1 text-[0.8125rem] font-bold transition-colors",
              pane === p ? "bg-ink text-canvas" : "text-subtle hover:bg-surface-2 hover:text-ink",
            )}
          >
            {p === "preview" ? "My CV" : "Refine with Cyclops"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <a
            href="/cv-print"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-pill border border-border px-4 py-1.5 text-[0.8125rem] font-bold text-ink transition-colors hover:bg-surface-2"
          >
            Download PDF
          </a>
          <a
            href="/api/cv/docx"
            className="rounded-pill bg-ink px-4 py-1.5 text-[0.8125rem] font-bold text-canvas transition-colors hover:opacity-80"
          >
            Download Word
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {pane === "preview" ? (
          <div className="h-full overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-2xl rounded-card border border-border bg-surface p-6 shadow-card">
              <CvDocument cv={liveCv} />
            </div>
          </div>
        ) : (
          <CvChat key={sessionId} sessionId={sessionId} initialMessages={initialMessages} onCvUpdate={handleCvUpdate} />
        )}
      </div>
    </div>
  );
}
