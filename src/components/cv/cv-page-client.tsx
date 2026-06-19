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
  handoff,
  initialPane = "preview",
}: {
  sessionId: string;
  initialMessages: UIMessage[];
  initialCv: CvData;
  initialHasCv: boolean;
  /**
   * U4b dock→CV handoff: a request forwarded from the main brain via the ?handoff=
   * query param. When present, the CV chat auto-sends it to the coach exactly
   * once on mount and then strips the param. Undefined on a normal visit.
   */
  handoff?: string;
  /**
   * Which pane to open on first mount. The server sets this to "chat" when a
   * handoff (or ?pane=refine) is present so the user lands in the coach view.
   */
  initialPane?: "preview" | "chat";
}) {
  const [hasCv, setHasCv] = useState(initialHasCv);
  const [cv, setCv] = useState<CvData>(initialCv);
  // After a draft we land the user in the refine pane (matches prior behaviour);
  // a normal page load opens the preview pane. A handoff arrives with
  // initialPane="chat" so the user lands mid-conversation in the coach view.
  const [shellPane, setShellPane] = useState<"preview" | "chat">(initialPane);
  // F2: the messages the CvShell mounts the chat with. Starts as the
  // server-loaded history; on an in-place upload transition we splice in the
  // freshly-seeded coach opening so the assessment + chips render immediately,
  // without a full reload (router.refresh) or a refetch. CvShell only mounts in
  // the has-CV branch below, so it picks these up fresh on the transition.
  const [chatMessages, setChatMessages] =
    useState<UIMessage[]>(initialMessages);

  const handleBuilt = useCallback((built: CvData) => {
    setCv(built);
    setShellPane("chat");
    setHasCv(true);
  }, []);

  const handleUploaded = useCallback(
    (parsed: CvData, coachOpening?: UIMessage) => {
      // Upload carries the parsed CvData up so we flip into the has-CV shell in
      // place — no full page reload (router.refresh). The user lands in the
      // refine pane with their CV shown and the coach opening already seeded.
      setCv(parsed);
      // F2: seed the chat with the coach opening so it shows on first paint.
      // The opening's id is its dedup clientId, identical to what a later /cv
      // load would assign the persisted row — so even if both are ever present
      // the chat dedups on id rather than double-rendering the opening.
      if (coachOpening) {
        setChatMessages((prev) =>
          prev.some((m) => m.id === coachOpening.id)
            ? prev
            : [...prev, coachOpening],
        );
      }
      setShellPane("chat");
      setHasCv(true);
    },
    [],
  );

  if (!hasCv) {
    return <CvEmptyState onBuilt={handleBuilt} onUploaded={handleUploaded} />;
  }

  return (
    <CvShell
      sessionId={sessionId}
      initialMessages={chatMessages}
      initialCv={cv}
      initialPane={shellPane}
      handoff={handoff}
    />
  );
}
