import type { AtsAdapter } from "./types";
import { parseTitle, humanizeSlug } from "./util";

// Workday is a dynamic React SPA with shadow-ish automation ids and multi-step
// flows — this adapter is explicitly best-effort. The generic field matcher
// still fills what it can recognize.
export const workday: AtsAdapter = {
  kind: "WORKDAY",
  matches: (host) => host.endsWith("myworkdayjobs.com"),
  formContainer() {
    return (
      document.querySelector('[data-automation-id="applyFlow"]') ??
      document.querySelector('[data-automation-id="jobApplicationApp"]') ??
      document.querySelector("main") ??
      document.body
    );
  },
  employerRole() {
    // <company>.wdN.myworkdayjobs.com
    const sub = window.location.hostname.split(".")[0];
    const employer = sub ? humanizeSlug(sub) : undefined;
    const role =
      document
        .querySelector('[data-automation-id="jobPostingHeader"]')
        ?.textContent?.trim() || parseTitle(document.title).role;
    return { employer, role };
  },
};
