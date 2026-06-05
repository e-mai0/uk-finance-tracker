/** Shared helpers used across ATS adapters. */

/** A form that contains an email field, else the first sizeable form, else null. */
export function findApplicationForm(): HTMLFormElement | null {
  const forms = Array.from(document.querySelectorAll("form"));
  const withEmail = forms.find((f) =>
    f.querySelector('input[type="email"], input[name*="email" i]'),
  );
  if (withEmail) return withEmail;
  // Fall back to the form with the most text inputs.
  let best: { form: HTMLFormElement; n: number } | null = null;
  for (const f of forms) {
    const n = f.querySelectorAll("input, textarea, select").length;
    if (n >= 3 && (!best || n > best.n)) best = { form: f, n };
  }
  return best?.form ?? null;
}

/** Parse "Job Application for X at Y" / "X - Y" style titles into role/employer. */
export function parseTitle(title: string): { employer?: string; role?: string } {
  const t = title.trim();
  let m = /job application for (.+?) at (.+?)(?:\s*[|–-].*)?$/i.exec(t);
  if (m) return { role: m[1].trim(), employer: m[2].trim() };
  m = /^(.+?)\s+at\s+(.+?)(?:\s*[|–-].*)?$/i.exec(t);
  if (m) return { role: m[1].trim(), employer: m[2].trim() };
  m = /^(.+?)\s*[|–-]\s*(.+?)$/.exec(t);
  if (m) return { role: m[1].trim(), employer: m[2].trim() };
  return { role: t || undefined };
}

export function firstHeading(): string | undefined {
  const h = document.querySelector("h1, h2");
  return h?.textContent?.trim() || undefined;
}

/** Title-case a company slug taken from a URL path/subdomain. */
export function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
