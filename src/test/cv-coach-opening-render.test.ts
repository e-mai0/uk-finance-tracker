// src/test/cv-coach-opening-render.test.ts
//
// Cycle 6 F2 — the CV chat must RENDER the coach opening (assessment text + the
// 3 suggested-move chips) when it mounts with that message in its
// initialMessages. This is the second half of the F2 fix: the upload path now
// threads the seeded opening into the chat's initialMessages on the in-place
// empty→has-CV transition, and the chat must surface it on first paint.
//
// Harness mirrors cv-page-client.test.ts: the repo has NO jsdom / RTL, so we
// render the client component to static markup via react-dom/server (a dep) and
// assert on the produced HTML. useChat is stubbed to return the SUPPLIED
// initialMessages verbatim (the real hook seeds from `messages` on mount), so
// this exercises the component's own part-rendering branch — the text part and
// the `data-coach-chips` CoachChips branch — not stubbed render logic.
//
// NOTE: this is a static-render proof of the RENDER branch. The MOUNT-time
// state-threading (uploadCvAction → handleUploaded → CvShell → CvChat
// initialMessages) is glue that only a real runtime drive fully exercises (the
// repo has no mount harness); that is flagged for the live re-drive.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

// Stub useChat to echo the initialMessages it is constructed with — exactly
// what the real hook exposes after seeding from `messages` on mount.
vi.mock("@ai-sdk/react", () => ({
  useChat: ({ messages }: { messages: UIMessage[] }) => ({
    messages,
    sendMessage: vi.fn(),
    regenerate: vi.fn(),
    stop: vi.fn(),
    status: "ready",
    error: undefined,
  }),
}));

import { CvChat } from "@/components/cv/cv-chat";

const ASSESSMENT =
  "I read your CV — strong projects, but your experience bullets read as duties.";

function openingMessage(): UIMessage {
  return {
    id: "coach-opening:sess-1",
    role: "assistant",
    parts: [
      { type: "text", text: ASSESSMENT },
      {
        type: "data-coach-chips",
        data: {
          chips: [
            { label: "Add a summary", prompt: "Draft a two-line summary." },
            { label: "Sharpen bullets", prompt: "Rewrite my bullets for impact." },
            { label: "Tailor to a role", prompt: "Tailor my CV to a finance internship." },
          ],
        },
      },
    ],
  } as unknown as UIMessage;
}

function render(messages: UIMessage[]): string {
  return renderToStaticMarkup(
    createElement(CvChat, { sessionId: "sess-1", initialMessages: messages }),
  );
}

describe("CvChat — renders the coach opening from initialMessages (F2)", () => {
  it("renders the assessment text", () => {
    const html = render([openingMessage()]);
    expect(html).toContain(ASSESSMENT);
  });

  it("renders all 3 suggested-move chips (the labels) as buttons", () => {
    const html = render([openingMessage()]);
    expect(html).toContain("Add a summary");
    expect(html).toContain("Sharpen bullets");
    expect(html).toContain("Tailor to a role");
    // The chips group is rendered (the CoachChips branch, not raw JSON).
    expect(html).toContain('aria-label="Suggested moves"');
    // The raw chip data-part type must NOT leak into the DOM as text.
    expect(html).not.toContain("data-coach-chips");
  });

  it("shows the empty-state hint instead when there is no opening", () => {
    const html = render([]);
    expect(html).not.toContain(ASSESSMENT);
    expect(html).not.toContain('aria-label="Suggested moves"');
    // The pane still renders its empty prompt.
    expect(html).toContain("CV Builder");
  });
});
