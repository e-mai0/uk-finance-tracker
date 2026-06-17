// src/test/cyclops-dock.test.ts
//
// U2 regression test for the global Cyclops dock's hidden-route set.
//
// The dock must NOT render on /cv (the CV coach is that page's only assistant)
// but MUST still render on non-excluded routes (e.g. /today, /tracker). The
// hidden set is computed inline in cyclops-dock.tsx from usePathname(); we
// drive it by mocking the router hook per-case and statically rendering the
// component (the repo's node + react-dom/server pattern — no jsdom).
//
// The mocks below only supply the runtime seams a node static render lacks
// (router hooks, the dock-thread server action, the chat hook, the CyclopsChat
// child). They do not stub the dock's own hidden/branching logic, which is what
// we are pinning.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let currentPath = "/today";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children?: unknown }) =>
    createElement("a", null, children as never),
}));
vi.mock("@/server/actions/dock", () => ({
  getOrCreateDockThread: vi.fn(),
}));
// CyclopsChat pulls in useChat() (browser-only) via the dock thread; the dock
// only mounts it once a thread is "ready", which never happens in a static
// render (the loading effect doesn't run), but stub it defensively.
vi.mock("@/app/(app)/chat/cyclops-chat", () => ({
  CyclopsChat: () => createElement("div", null, "chat"),
}));

import { CyclopsDock } from "@/components/dock/cyclops-dock";

function renderAt(pathname: string): string {
  currentPath = pathname;
  return renderToStaticMarkup(createElement(CyclopsDock, { badge: 0 }));
}

describe("CyclopsDock — hidden routes", () => {
  it("does not render on /cv (CV coach is the only assistant there)", () => {
    expect(renderAt("/cv")).toBe("");
  });

  it("does not render on /cv subpaths", () => {
    expect(renderAt("/cv/anything")).toBe("");
  });

  it("still does not render on the pre-existing hidden routes", () => {
    expect(renderAt("/settings")).toBe("");
    expect(renderAt("/chat")).toBe("");
    expect(renderAt("/memory")).toBe("");
  });

  it("still renders on non-excluded routes (/today, /tracker)", () => {
    const today = renderAt("/today");
    expect(today).not.toBe("");
    expect(today).toContain("CYCLOPS");

    const tracker = renderAt("/tracker");
    expect(tracker).not.toBe("");
    expect(tracker).toContain("CYCLOPS");
  });
});
