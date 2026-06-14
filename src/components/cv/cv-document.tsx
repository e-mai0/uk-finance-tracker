// src/components/cv/cv-document.tsx
// Shared CV preview component. Renders CvData to styled HTML using design
// tokens. All text is rendered as React text nodes — never dangerouslySetInnerHTML.
// Used by /my-cv, /cv-builder live preview, and /cv-print.
import type { CvData } from "@/lib/cv";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-5 mb-1.5 border-b border-border pb-0.5 text-[0.6875rem] font-bold uppercase tracking-widest text-subtle">
      {children}
    </h2>
  );
}

function EntryHead({
  primary,
  secondary,
  dates,
}: {
  primary: string;
  secondary?: string;
  dates?: string;
}) {
  return (
    <div className="mt-2 flex items-baseline justify-between gap-3">
      <span className="font-semibold text-ink">
        {primary}
        {secondary && (
          <>
            <span className="mx-1 font-normal text-muted"> — </span>
            <span className="font-normal text-ink">{secondary}</span>
          </>
        )}
      </span>
      {dates && <span className="shrink-0 text-[0.75rem] text-muted">{dates}</span>}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="ml-4 mt-0.5 list-disc space-y-0.5">
      {items.map((b, i) => (
        <li key={i} className="text-[0.8125rem] text-ink">
          {b}
        </li>
      ))}
    </ul>
  );
}

export function CvDocument({ cv }: { cv: CvData }) {
  const contactBits = [
    cv.contact.email,
    cv.contact.phone,
    cv.contact.location,
    cv.contact.linkedin,
    cv.contact.github,
    cv.contact.website,
  ].filter(Boolean) as string[];

  return (
    <article className="cv-document mx-auto max-w-2xl text-[0.875rem] leading-snug text-ink">
      {/* Header */}
      <header className="mb-2 text-center">
        <h1 className="text-2xl font-bold">{cv.fullName || "Your Name"}</h1>
        {cv.headline && <p className="mt-0.5 text-muted">{cv.headline}</p>}
        {contactBits.length > 0 && (
          <p className="mt-1 text-[0.75rem] text-muted">{contactBits.join("  |  ")}</p>
        )}
      </header>

      {/* Summary */}
      {cv.summary && (
        <>
          <SectionHeading>Summary</SectionHeading>
          <p className="mt-1 text-ink">{cv.summary}</p>
        </>
      )}

      {/* Education */}
      {cv.education.length > 0 && (
        <>
          <SectionHeading>Education</SectionHeading>
          {cv.education.map((e, i) => (
            <div key={i}>
              <EntryHead primary={e.institution} secondary={e.qualification} dates={e.dates} />
              {e.grade && <p className="mt-0.5 text-[0.8125rem] italic text-muted">{e.grade}</p>}
              <BulletList items={e.bullets} />
            </div>
          ))}
        </>
      )}

      {/* Experience */}
      {cv.experience.length > 0 && (
        <>
          <SectionHeading>Experience</SectionHeading>
          {cv.experience.map((x, i) => (
            <div key={i}>
              <EntryHead primary={x.org} secondary={x.role} dates={x.dates} />
              <BulletList items={x.bullets} />
            </div>
          ))}
        </>
      )}

      {/* Projects */}
      {cv.projects.length > 0 && (
        <>
          <SectionHeading>Projects &amp; Competitions</SectionHeading>
          {cv.projects.map((p, i) => (
            <div key={i}>
              <EntryHead primary={p.name} secondary={p.result} dates={p.dates} />
              {p.skills.length > 0 && (
                <p className="mt-0.5 text-[0.75rem] italic text-muted">{p.skills.join(", ")}</p>
              )}
              <BulletList items={p.bullets} />
            </div>
          ))}
        </>
      )}

      {/* Accomplishments / Honours & Awards */}
      {cv.accomplishments.length > 0 && (
        <>
          <SectionHeading>Honours &amp; Awards</SectionHeading>
          <ul className="ml-4 mt-0.5 list-disc space-y-0.5">
            {cv.accomplishments.map((a, i) => (
              <li key={i} className="text-[0.8125rem] text-ink">
                {a.title}
                {a.date && <span className="text-muted"> ({a.date})</span>}
                {a.description && <span className="text-muted"> — {a.description}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Skills & Interests */}
      {(cv.skills.length > 0 || cv.interests.length > 0) && (
        <>
          <SectionHeading>Skills &amp; Interests</SectionHeading>
          {cv.skills.map((g, i) => (
            <p key={i} className="mt-0.5 text-[0.8125rem]">
              <span className="font-semibold">{g.label}:</span>{" "}
              <span className="text-ink">{g.items.join(", ")}</span>
            </p>
          ))}
          {cv.interests.length > 0 && (
            <p className="mt-0.5 text-[0.8125rem]">
              <span className="font-semibold">Interests:</span>{" "}
              <span className="text-ink">{cv.interests.join(", ")}</span>
            </p>
          )}
        </>
      )}

      {/* Custom sections */}
      {cv.sections.map((sec, si) => (
        <div key={si}>
          <SectionHeading>{sec.heading}</SectionHeading>
          {sec.entries.map((e, ei) => (
            <div key={ei}>
              {(e.primary || e.secondary || e.dates) && (
                <EntryHead primary={e.primary ?? ""} secondary={e.secondary} dates={e.dates} />
              )}
              {e.text && <p className="mt-0.5 text-[0.8125rem] text-ink">{e.text}</p>}
              <BulletList items={e.bullets} />
            </div>
          ))}
        </div>
      ))}
    </article>
  );
}
