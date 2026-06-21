// src/test/error-boundary-render.test.ts
//
// U1 Part A — static-render proof that the App-Router error boundaries show
// recovery UI and NEVER leak the error message/stack to a stranger.
//
// Harness mirrors cv-coach-opening-render.test.ts: the repo has no jsdom/RTL, so
// we render the client components to static markup via react-dom/server and
// assert on the produced HTML. This exercises the components' own render output
// (the recovery copy, the buttons, and crucially the ABSENCE of leaked error
// detail). What it canNOT cover — the actual React error-CATCH behaviour at
// runtime, and the onClick reset() handler firing — is flagged for live
// verification in the report (no mount harness in this repo).
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/link renders an <a> in static markup; stub to avoid pulling the router.
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));

import GlobalError from "@/app/global-error";
import AppError from "@/app/error";
import { GENERIC_ERROR_TITLE } from "@/lib/error-display";

const SECRET = "DATABASE_URL=postgres://user:hunter2@host/db";
const STACK = "Error: boom\n    at Object.<anonymous> (/app/src/server/db.ts:42:13)";

function makeError(): Error & { digest?: string } {
  return Object.assign(new Error(SECRET), {
    digest: "support-ref-42",
    stack: STACK,
  });
}

function reset() {
  /* no-op for static render */
}

describe("global-error.tsx", () => {
  const html = renderToStaticMarkup(
    createElement(GlobalError, { error: makeError(), reset }),
  );

  it("renders its own <html> and <body> (it replaces the root layout)", () => {
    expect(html).toContain("<html");
    expect(html).toContain("<body");
  });

  it("renders on-brand recovery copy and a 'Try again' control", () => {
    expect(html).toContain(GENERIC_ERROR_TITLE);
    expect(html.toLowerCase()).toContain("try again");
    // Not an empty boundary — it has visible body text.
    expect(html.replace(/<[^>]+>/g, "").trim().length).toBeGreaterThan(20);
  });

  it("NEVER leaks the raw error message or stack", () => {
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain("hunter2");
    expect(html).not.toContain("db.ts");
    expect(html).not.toContain("at Object");
  });
});

describe("error.tsx (top-level segment boundary)", () => {
  const html = renderToStaticMarkup(
    createElement(AppError, { error: makeError(), reset }),
  );

  it("renders on-brand recovery copy and a 'Try again' control", () => {
    expect(html).toContain(GENERIC_ERROR_TITLE);
    expect(html.toLowerCase()).toContain("try again");
    expect(html.replace(/<[^>]+>/g, "").trim().length).toBeGreaterThan(20);
  });

  it("offers a link back to a safe page", () => {
    expect(html).toMatch(/href="\/(today)?"/);
  });

  it("NEVER leaks the raw error message or stack", () => {
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain("hunter2");
    expect(html).not.toContain("db.ts");
    expect(html).not.toContain("at Object");
  });

  it("MAY show the opaque digest as a support reference (allowed)", () => {
    expect(html).toContain("support-ref-42");
  });
});
