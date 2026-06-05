import type { AtsAdapter } from "./types";
import { findApplicationForm, parseTitle, firstHeading } from "./util";

export const greenhouse: AtsAdapter = {
  kind: "GREENHOUSE",
  matches: (host) => host.includes("greenhouse.io"),
  formContainer() {
    return (
      document.querySelector("#application_form") ??
      document.querySelector("#application-form") ??
      document.querySelector('form[action*="greenhouse"]') ??
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
