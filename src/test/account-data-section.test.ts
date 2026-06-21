// src/test/account-data-section.test.ts
//
// U2 UI — the settings "Your data" / "Danger zone" client section. The repo has
// no jsdom/RTL, so (mirroring cv-coach-opening-render.test.ts) we render the
// client component to static markup via react-dom/server and assert on the HTML.
//
// What this proves at the markup level:
//  - an "Export my data" affordance exists;
//  - a "Delete account" destructive affordance exists;
//  - the delete button is DISABLED until the user types the confirmation phrase
//    (rendered initial state has no confirmation, so it must be disabled). This
//    is the static half of the typed-confirmation guard; the action-level guard
//    in account-actions.test.ts is the authoritative one.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

// The section calls the server actions on user gestures only; stub them so the
// static render never invokes them.
vi.mock("@/server/actions/account", () => ({
  deleteAccount: vi.fn(),
  exportMyData: vi.fn(),
  // The component reads the confirmation phrase from the actions module — keep
  // it in sync with the real constant.
  DELETE_CONFIRM_PHRASE: "DELETE",
}));

import { AccountData } from "@/app/(app)/settings/account-data";

function render(): string {
  return renderToStaticMarkup(createElement(AccountData));
}

describe("AccountData settings section", () => {
  it("renders an export-my-data affordance", () => {
    const html = render();
    expect(html.toLowerCase()).toContain("export");
  });

  it("renders a delete-account affordance", () => {
    const html = render();
    expect(html.toLowerCase()).toContain("delete account");
  });

  it("tells the user which phrase to type to confirm deletion", () => {
    const html = render();
    expect(html).toContain("DELETE");
  });

  it("the confirm-delete button is DISABLED before the phrase is typed", () => {
    const html = render();
    // The destructive submit must start disabled (no confirmation typed yet).
    // Find the button whose text is the delete confirmation and assert disabled.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Delete account[^<]*<\/button>/i);
  });
});
