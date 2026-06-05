import type { AtsAdapter } from "./types";
import { findApplicationForm, parseTitle, humanizeSlug } from "./util";

export const lever: AtsAdapter = {
  kind: "LEVER",
  matches: (host) => host.endsWith("lever.co"),
  formContainer() {
    return (
      document.querySelector("form.application-form") ??
      document.querySelector(".application-form") ??
      document.querySelector('form[action*="lever"]') ??
      findApplicationForm()
    );
  },
  employerRole() {
    // jobs.lever.co/<company>/<id>
    const seg = window.location.pathname.split("/").filter(Boolean)[0];
    const employer = seg ? humanizeSlug(seg) : parseTitle(document.title).employer;
    const role =
      document.querySelector(".posting-headline h2")?.textContent?.trim() ||
      parseTitle(document.title).role;
    return { employer, role };
  },
};
