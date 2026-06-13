// src/lib/cv.ts
import { z } from "zod";

const s = z.string().trim();

// ---------------------------------------------------------------------------
// CvData — the structured CV (single source of truth). zod v3.
// Dates are free-text strings ("Sep 2025 – Jun 2028"). Entries may carry an
// optional subtitle/result line. Modelled on the supplied template CV.
// ---------------------------------------------------------------------------
export const cvDataSchema = z.object({
  fullName: s.default(""),
  headline: s.optional(),
  contact: z
    .object({
      email: s.optional(),
      phone: s.optional(),
      location: s.optional(),
      linkedin: s.optional(),
      github: s.optional(),
      website: s.optional(),
    })
    .default({}),
  summary: s.optional(),
  education: z
    .array(
      z.object({
        institution: s,
        qualification: s,
        dates: s.optional(),
        grade: s.optional(),
        bullets: z.array(s).default([]),
      }),
    )
    .default([]),
  experience: z
    .array(
      z.object({
        org: s,
        role: s.optional(),
        dates: s.optional(),
        bullets: z.array(s).default([]),
      }),
    )
    .default([]),
  accomplishments: z
    .array(z.object({ title: s, date: s.optional(), description: s.optional() }))
    .default([]),
  projects: z
    .array(
      z.object({
        name: s,
        result: s.optional(),
        dates: s.optional(),
        skills: z.array(s).default([]),
        bullets: z.array(s).default([]),
        link: s.optional(),
      }),
    )
    .default([]),
  skills: z.array(z.object({ label: s, items: z.array(s).default([]) })).default([]),
  interests: z.array(s).default([]),
  sections: z
    .array(
      z.object({
        heading: s,
        entries: z
          .array(
            z.object({
              primary: s.optional(),
              secondary: s.optional(),
              dates: s.optional(),
              bullets: z.array(s).default([]),
              text: s.optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});
export type CvData = z.infer<typeof cvDataSchema>;

export const EMPTY_CV: CvData = cvDataSchema.parse({});

// ---------------------------------------------------------------------------
// The 3-step form input. Flatter than CvData; mapped deterministically below.
// ---------------------------------------------------------------------------
export const cvFormInputSchema = z.object({
  education: z
    .array(
      z.object({
        institution: s.default(""),
        qualification: s.default(""),
        startYear: s.optional(),
        endYear: s.optional(),
        grade: s.optional(),
        modules: s.optional(),
      }),
    )
    .default([]),
  accomplishments: z
    .array(z.object({ title: s.default(""), date: s.optional(), description: s.optional() }))
    .default([]),
  projects: z
    .array(
      z.object({
        name: s.default(""),
        dates: s.optional(),
        skills: s.optional(),
        description: s.optional(),
        link: s.optional(),
      }),
    )
    .default([]),
});
export type CvFormInput = z.infer<typeof cvFormInputSchema>;

export type CvPrefill = {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
};

// --- pure helpers -----------------------------------------------------------

function splitLines(text?: string): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function splitCsv(text?: string): string[] {
  if (!text) return [];
  return text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function composeYears(start?: string, end?: string): string | undefined {
  const a = start?.trim();
  const b = end?.trim();
  if (a && b) return `${a} – ${b}`;
  return a || b || undefined;
}

function clean<T extends Record<string, unknown>>(obj: T): T {
  // Drop undefined keys so optional() fields stay absent.
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Deterministically map the 3-step form to a valid CvData — NO AI required. */
export function formInputToCvData(formInput: CvFormInput, prefill: CvPrefill): CvData {
  return cvDataSchema.parse({
    fullName: prefill.fullName,
    contact: clean({
      email: prefill.email,
      phone: prefill.phone,
      location: prefill.location,
      linkedin: prefill.linkedin,
      github: prefill.github,
      website: prefill.website,
    }),
    education: formInput.education
      .filter((e) => e.institution || e.qualification)
      .map((e) =>
        clean({
          institution: e.institution,
          qualification: e.qualification,
          dates: composeYears(e.startYear, e.endYear),
          grade: e.grade,
          bullets: splitLines(e.modules),
        }),
      ),
    accomplishments: formInput.accomplishments
      .filter((a) => a.title)
      .map((a) => clean({ title: a.title, date: a.date, description: a.description })),
    projects: formInput.projects
      .filter((p) => p.name)
      .map((p) =>
        clean({
          name: p.name,
          dates: p.dates,
          skills: splitCsv(p.skills),
          bullets: splitLines(p.description),
          link: p.link,
        }),
      ),
  });
}

/** Slugify a user name for use in a download filename, e.g. "Eric Mai" → "Eric_Mai". */
export function slugifyName(name: string): string {
  return (
    name
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "") || "CV"
  );
}

/** Flatten CvData to plain text for grounding (mirrors what an uploaded CV's text looks like). */
export function cvToPlainText(cv: CvData): string {
  const out: string[] = [];
  if (cv.fullName) out.push(cv.fullName);
  const contact = [cv.contact.email, cv.contact.phone, cv.contact.linkedin, cv.contact.website]
    .filter(Boolean)
    .join(" | ");
  if (contact) out.push(contact);
  if (cv.summary) out.push(`\nSUMMARY\n${cv.summary}`);

  if (cv.education.length) {
    out.push("\nEDUCATION");
    for (const e of cv.education) {
      out.push(`${e.institution} — ${e.qualification}${e.dates ? ` (${e.dates})` : ""}`);
      if (e.grade) out.push(`Grade: ${e.grade}`);
      e.bullets.forEach((b) => out.push(`- ${b}`));
    }
  }
  if (cv.experience.length) {
    out.push("\nEXPERIENCE");
    for (const x of cv.experience) {
      out.push(`${x.org}${x.role ? ` — ${x.role}` : ""}${x.dates ? ` (${x.dates})` : ""}`);
      x.bullets.forEach((b) => out.push(`- ${b}`));
    }
  }
  if (cv.projects.length) {
    out.push("\nPROJECTS & COMPETITIONS");
    for (const p of cv.projects) {
      out.push(`${p.name}${p.result ? ` — ${p.result}` : ""}${p.dates ? ` (${p.dates})` : ""}`);
      p.bullets.forEach((b) => out.push(`- ${b}`));
    }
  }
  if (cv.accomplishments.length) {
    out.push("\nHONOURS & AWARDS");
    cv.accomplishments.forEach((a) =>
      out.push(`- ${a.title}${a.date ? ` (${a.date})` : ""}${a.description ? `: ${a.description}` : ""}`),
    );
  }
  if (cv.skills.length || cv.interests.length) {
    out.push("\nSKILLS & INTERESTS");
    cv.skills.forEach((g) => out.push(`${g.label}: ${g.items.join(", ")}`));
    if (cv.interests.length) out.push(`Interests: ${cv.interests.join(", ")}`);
  }
  for (const sec of cv.sections) {
    out.push(`\n${sec.heading.toUpperCase()}`);
    for (const e of sec.entries) {
      const head = [e.primary, e.secondary, e.dates].filter(Boolean).join(" — ");
      if (head) out.push(head);
      if (e.text) out.push(e.text);
      e.bullets.forEach((b) => out.push(`- ${b}`));
    }
  }
  return out.join("\n").trim();
}
