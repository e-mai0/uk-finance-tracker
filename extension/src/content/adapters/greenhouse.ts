import type { AtsAdapter } from "./types";
import { findApplicationForm, parseTitle, firstHeading } from "./util";

export const greenhouse: AtsAdapter = {
  kind: "GREENHOUSE",
  matches: (host) =>
    host.includes("greenhouse.io") || host.includes("boards.greenhouse.io"),
  formContainer() {
    return (
      document.querySelector("#application_form") ??       // classic boards
      document.querySelector("#application-form") ??       // new job board
      document.querySelector('form[id*="application" i]') ??
      document.querySelector('form[action*="greenhouse"]') ??
      document.querySelector("main form") ??               // job-boards.greenhouse.io
      findApplicationForm()
    );
  },
  employerRole() {
    // Greenhouse titles are reliably "Job Application for <role> at <company>".
    const fromTitle = parseTitle(document.title);
    const role =
      document.querySelector(".app-title, .job__title h1")?.textContent?.trim() ||
      fromTitle.role ||
      firstHeading();
    const employer =
      document.querySelector(".company-name, .app-title + *")?.textContent?.trim() ||
      fromTitle.employer;
    return { employer, role };
  },
};
