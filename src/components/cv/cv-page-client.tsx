// src/components/cv/cv-page-client.tsx
// Thin entry for the unified /cv page. Decides empty-vs-has-CV and renders the
// matching seam component:
//   - empty  → <CvEmptyState>  (Build with Cyclops / Upload a CV)
//   - has CV → <CvShell>       (document + Refine-with-Cyclops chat + downloads)
//
// This file owns only the empty↔has-CV transition: when a draft/upload
// succeeds, it flips into the shell. The shell owns the live CV, the pane
// toggle, the header, and the layout; the empty state owns the build/upload
// controls + handlers. v1 is chat + confirm only — no direct field editing.
//
// Prop contract (unchanged from before the U0 split — page.tsx is the caller):
//   {
//     sessionId: string;
//     initialMessages: UIMessage[];
//     initialCv: CvData;
//     initialHasCv: boolean;
//   }
"use client";

import { useState, useCallback } from "react";
import { CvEmptyState } from "@/components/cv/cv-empty-state";
import { CvShell } from "@/components/cv/cv-shell";
import type { CvData } from "@/lib/cv";
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
  const [hasCv, setHasCv] = useState(initialHasCv);
  const [cv, setCv] = useState<CvData>(initialCv);
  // After a draft we land the user in the refine pane (matches prior behaviour);
  // a normal page load opens the preview pane.
  const [shellPane, setShellPane] = useState<"preview" | "chat">("preview");

  const handleBuilt = useCallback((built: CvData) => {
    setCv(built);
    setShellPane("chat");
    setHasCv(true);
  }, []);

  const handleUploaded = useCallback(() => {
    // Upload relies on the server re-render (router.refresh in the empty state)
    // to supply the parsed CV; flip into the shell so the transition is seamless.
    setShellPane("preview");
    setHasCv(true);
  }, []);

  if (!hasCv) {
    return <CvEmptyState onBuilt={handleBuilt} onUploaded={handleUploaded} />;
  }

  return (
    <CvShell
      sessionId={sessionId}
      initialMessages={initialMessages}
      initialCv={cv}
      initialPane={shellPane}
    />
  );
}
