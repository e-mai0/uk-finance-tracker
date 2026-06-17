// src/test/cv-page-client.test.ts
//
// U0 behaviour-pinning render test for the /cv page client.
//
// This is a PURE-REFACTOR safety net: it captures the CURRENT user-visible
// behaviour of <CvPageClient> (empty state vs has-CV state) BEFORE the
// conflict-nexus file is split into seam components, and must stay green
// afterwards. If a later split changes any assertion here, the refactor
// changed behaviour — fix the refactor, not this test.
//
// The repo's test harness is vitest + the `node` environment (see
// vitest.config.ts) with NO @testing-library / jsdom. We therefore render the
// client components to static markup via react-dom/server (already a dep) and
// assert on the produced HTML. The mocks below only supply the runtime seams a
// node static render lacks (router, the two server actions, the chat hook) —
// they do not stub the component's own branching/layout logic, which is what
// we are pinning.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/server/actions/cv", () => ({ draftCvFromKnown: vi.fn() }));
vi.mock("@/server/actions/applyProfile", () => ({ uploadCvAction: vi.fn() }));
// <CvChat> calls useChat() from @ai-sdk/react, which needs a browser runtime;
// stub it to a ready/empty chat so the chat pane renders statically.
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    regenerate: vi.fn(),
    stop: vi.fn(),
    status: "ready",
    error: undefined,
  }),
}));

import { CvPageClient } from "@/components/cv/cv-page-client";
import { EMPTY_CV, type CvData } from "@/lib/cv";

function renderEmpty(): string {
  return renderToStaticMarkup(
    createElement(CvPageClient, {
      sessionId: "sess-1",
      initialMessages: [],
      initialCv: EMPTY_CV,
      initialHasCv: false,
    }),
  );
}

function renderHasCv(): string {
  const cv: CvData = { ...EMPTY_CV, fullName: "Eric Mai" };
  return renderToStaticMarkup(
    createElement(CvPageClient, {
      sessionId: "sess-1",
      initialMessages: [],
      initialCv: cv,
      initialHasCv: true,
    }),
  );
}

describe("CvPageClient — empty state", () => {
  it("offers the Build-with-Cyclops action", () => {
    expect(renderEmpty()).toContain("Build with Cyclops");
  });

  it("offers the Upload-a-CV control with a file input", () => {
    const html = renderEmpty();
    expect(html).toContain("Upload a CV");
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".pdf,.doc,.docx,.txt"');
  });

  it("does not render the has-CV download links or tab toggle", () => {
    const html = renderEmpty();
    expect(html).not.toContain("Download PDF");
    expect(html).not.toContain("Download Word");
    expect(html).not.toContain("Refine with Cyclops");
  });
});

describe("CvPageClient — has-CV state", () => {
  it("renders the CV document with the person's name", () => {
    expect(renderHasCv()).toContain("Eric Mai");
  });

  // U2 sanctioned behaviour change: the has-CV state no longer uses a
  // preview/chat TAB TOGGLE — the two panes are shown SIDE BY SIDE so the user
  // can see the CV and talk to the coach at once. We therefore assert the new
  // side-by-side contract (both panes rendered simultaneously) instead of the
  // old toggle. The download-link / empty-state assertions below are unchanged.
  it("renders the preview and chat panes side by side (both visible at once)", () => {
    const html = renderHasCv();
    // Preview pane is present (the CV document with the person's name).
    expect(html).toContain("Eric Mai");
    // Chat pane is present at the same time (its composer placeholder), not
    // hidden behind a tab — this is the side-by-side contract.
    expect(html).toContain("Tell me what to add or change…");
  });

  it("renders the Download PDF link to /cv-print", () => {
    const html = renderHasCv();
    expect(html).toContain("Download PDF");
    expect(html).toContain('href="/cv-print"');
  });

  it("renders the Download Word link to /api/cv/docx", () => {
    const html = renderHasCv();
    expect(html).toContain("Download Word");
    expect(html).toContain('href="/api/cv/docx"');
  });

  it("does not render the empty-state Build/Upload controls", () => {
    const html = renderHasCv();
    expect(html).not.toContain("Build with Cyclops");
    expect(html).not.toContain("Upload a CV");
  });
});
