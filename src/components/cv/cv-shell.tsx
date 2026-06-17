// src/components/cv/cv-shell.tsx
// Seam component (U0 refactor; U2 layout): the has-CV orchestrating shell.
// OWNS: the live CV state, the responsive layout region that arranges the
// preview pane and the chat pane, and the header (Download PDF / Download Word
// links). Renders <CvPreviewPane> and <CvChatPane>.
//
// Prop contract:
//   {
//     sessionId: string;             // CV chat session id (forwarded to chat pane)
//     initialMessages: UIMessage[];  // server-loaded chat history
//     initialCv: CvData;             // initial CV to preview (becomes live state)
//     initialPane?: "preview" | "chat"; // U0 prop; under U2 side-by-side it only
//                                        // seeds the MOBILE tab default (both panes
//                                        // are shown together on desktop).
//   }
//
// U2: the old preview/chat TAB TOGGLE is gone. On desktop (lg+) the preview and
// chat panes render TOGETHER in a two-column split — chat edits update the live
// preview in place (the liveCv + onCvUpdate flow is unchanged). On narrow
// screens the two stack into a compact segmented toggle so each stays usable
// and reachable. The global dock no longer renders on /cv (see cyclops-dock),
// so the shell owns the full page width.
"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CvPreviewPane } from "@/components/cv/cv-preview-pane";
import { CvChatPane } from "@/components/cv/cv-chat-pane";
import type { CvData } from "@/lib/cv";
import type { UIMessage } from "ai";

export function CvShell({
  sessionId,
  initialMessages,
  initialCv,
  initialPane = "preview",
}: {
  sessionId: string;
  initialMessages: UIMessage[];
  initialCv: CvData;
  /**
   * Which pane to open on first mount. Under the U2 side-by-side layout both
   * panes are always visible on desktop, so this prop no longer toggles the
   * desktop view — it only seeds the MOBILE segmented-toggle default (so a
   * post-draft landing of "chat" still opens the refine side on a phone). The
   * prop stays accepted so the U0 caller (cv-page-client.tsx) compiles
   * unchanged; passing "preview" keeps today's mobile default.
   */
  initialPane?: "preview" | "chat";
}) {
  const [liveCv, setLiveCv] = useState<CvData>(initialCv);
  // Mobile-only: which pane the narrow segmented toggle shows. Desktop ignores
  // this and shows both side by side.
  const [mobilePane, setMobilePane] = useState<"preview" | "chat">(initialPane);

  const handleCvUpdate = useCallback((cv: CvData) => {
    setLiveCv(cv);
  }, []);

  return (
    <div className="animate-rise flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      {/* Header: mobile segmented toggle (lg-hidden) + download links */}
      <div className="flex items-center gap-1 border-b border-border bg-surface px-4 py-2">
        {/* Segmented toggle only matters on narrow screens; on lg+ both panes
            are shown together so the toggle is hidden. */}
        <div className="flex items-center gap-1 lg:hidden" role="tablist" aria-label="CV view">
          {(["preview", "chat"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={mobilePane === p}
              onClick={() => setMobilePane(p)}
              className={cn(
                "rounded-pill px-3 py-1 text-[0.8125rem] font-bold transition-colors",
                mobilePane === p
                  ? "bg-ink text-canvas"
                  : "text-subtle hover:bg-surface-2 hover:text-ink",
              )}
            >
              {p === "preview" ? "My CV" : "Refine with Cyclops"}
            </button>
          ))}
        </div>
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

      {/* Layout region.
          Desktop (lg+): a two-column flex split — BOTH panes render together.
          Mobile: only the pane the segmented toggle selects is shown.
          Both panes are always mounted (so chat state + live edits persist);
          on mobile the unselected one is hidden via `hidden`, and on lg+ both
          are forced visible with `lg:flex`/`lg:block`. */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className={cn(
            "min-h-0 flex-1 overflow-hidden lg:block lg:w-1/2 lg:border-r lg:border-border",
            mobilePane === "preview" ? "block" : "hidden",
          )}
        >
          <CvPreviewPane cv={liveCv} />
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-hidden lg:flex lg:w-1/2 lg:flex-col",
            mobilePane === "chat" ? "flex flex-col" : "hidden",
          )}
        >
          <CvChatPane
            sessionId={sessionId}
            initialMessages={initialMessages}
            onCvUpdate={handleCvUpdate}
          />
        </div>
      </div>
    </div>
  );
}
