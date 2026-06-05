import type { AtsAdapter } from "./types";
import { findApplicationForm, parseTitle, humanizeSlug, firstHeading } from "./util";

export const ashby: AtsAdapter = {
  kind: "ASHBY",
  matches: (host) => host.endsWith("ashbyhq.com"),
  formContainer() {
    return (
      document.querySelector('form[class*="ApplicationForm"]') ??
      document.querySelector('[class*="application"] form') ??
      findApplicationForm()
    );
  },
  employerRole() {
    // jobs.ashbyhq.com/<company>/<id>
    const seg = window.location.pathname.split("/").filter(Boolean)[0];
    const employer = seg ? humanizeSlug(seg) : parseTitle(document.title).employer;
    const role = firstHeading() || parseTitle(document.title).role;
    return { employer, role };
  },
};
