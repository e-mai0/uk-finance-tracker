// src/components/cv/cv-shell.tsx
// Seam component (U0 refactor): the has-CV orchestrating shell.
// OWNS: the live CV state, the pane tab-toggle state + toggle UI, the header
// (Download PDF / Download Word links), and the layout region that arranges the
// preview pane vs the chat pane. Renders <CvPreviewPane> and <CvChatPane>.
//
// Prop contract:
//   {
//     sessionId: string;             // CV chat session id (forwarded to chat pane)
//     initialMessages: UIMessage[];  // server-loaded chat history
//     initialCv: CvData;             // initial CV to preview (becomes live state)
//   }
//
// Owned by U0. LATER: U2 replaces the tab-toggle layout region with a
// responsive side-by-side / stacked layout — that change is isolated to the
// `pane` toggle + the "layout region" block below.
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
   * Which pane to open on first mount. Defaults to "preview" (today's load
   * behaviour). The entry passes "chat" when the shell mounts right after a
   * draft, preserving the original "land the user in the refine view" flow.
   */
  initialPane?: "preview" | "chat";
}) {
  const [liveCv, setLiveCv] = useState<CvData>(initialCv);
  const [pane, setPane] = useState<"preview" | "chat">(initialPane);

  const handleCvUpdate = useCallback((cv: CvData) => {
    setLiveCv(cv);
  }, []);

  return (
    <div className="animate-rise flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      {/* Header: tab toggle + download links */}
      <div className="flex items-center gap-1 border-b border-border bg-surface px-4 py-2">
        {(["preview", "chat"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPane(p)}
            className={cn(
              "rounded-pill px-3 py-1 text-[0.8125rem] font-bold transition-colors",
              pane === p
                ? "bg-ink text-canvas"
                : "text-subtle hover:bg-surface-2 hover:text-ink",
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

      {/* Layout region: preview vs chat (U2 turns this into side-by-side) */}
      <div className="flex-1 overflow-hidden">
        {pane === "preview" ? (
          <CvPreviewPane cv={liveCv} />
        ) : (
          <CvChatPane
            sessionId={sessionId}
            initialMessages={initialMessages}
            onCvUpdate={handleCvUpdate}
          />
        )}
      </div>
    </div>
  );
}
