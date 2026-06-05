import type { AtsAdapter } from "./types";
import { findApplicationForm, parseTitle, firstHeading } from "./util";

// Fallback for any other host (not injected by default, but keeps detection
// total). Relies entirely on the generic field matcher.
export const generic: AtsAdapter = {
  kind: "OTHER",
  matches: () => true,
  formContainer() {
    return findApplicationForm();
  },
  employerRole() {
    const t = parseTitle(document.title);
    return { employer: t.employer, role: t.role || firstHeading() };
  },
};
