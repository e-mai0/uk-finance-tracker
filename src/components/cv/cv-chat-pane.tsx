// src/components/cv/cv-chat-pane.tsx
// Seam component (U0 refactor): the "Refine with Cyclops" chat pane.
// The single home for rendering the CV coach chat. Wraps <CvChat>.
//
// Prop contract:
//   {
//     sessionId: string;              // CV chat session id (also the useChat id)
//     initialMessages: UIMessage[];   // server-loaded message history
//     onCvUpdate?: (cv: CvData) => void; // lifts update_cv outputs to the shell
//   }
//
// Owned by U0. LATER: U1 adds suggestion-chip UI here; U4 reads query params +
// auto-sends here. Keep this the only place chat is rendered so those units
// plug in without touching the shell or the preview pane.
"use client";

import { CvChat } from "@/components/cv/cv-chat";
import type { CvData } from "@/lib/cv";
import type { UIMessage } from "ai";

export function CvChatPane({
  sessionId,
  initialMessages,
  onCvUpdate,
}: {
  sessionId: string;
  initialMessages: UIMessage[];
  onCvUpdate?: (cv: CvData) => void;
}) {
  return (
    <CvChat
      key={sessionId}
      sessionId={sessionId}
      initialMessages={initialMessages}
      onCvUpdate={onCvUpdate}
    />
  );
}
