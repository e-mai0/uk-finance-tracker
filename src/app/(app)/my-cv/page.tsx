// src/app/(app)/my-cv/page.tsx
// Shows the user's saved CV with download options.
// "Download PDF" opens the print view (browser Save-as-PDF).
// "Download Word" links to GET /api/cv/docx.
// Empty state links to /cv-builder.
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getBuiltCv } from "@/server/cv/store";
import { CvDocument } from "@/components/cv/cv-document";

export const dynamic = "force-dynamic";
export const metadata = { title: "My CV — Cyclops" };

export default async function MyCvPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const built = await getBuiltCv(session.user.id);

  if (!built) {
    return (
      <div className="animate-rise flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="text-xl font-bold text-ink">No CV yet</h1>
        <p className="text-[0.875rem] text-muted">
          Build your CV using the guided form and chatbot assistant.
        </p>
        <Link
          href="/cv-builder"
          className="rounded-pill bg-ink px-5 py-2 text-[0.875rem] font-bold text-canvas transition-colors hover:opacity-80"
        >
          Build my CV
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-rise mx-auto max-w-3xl px-4 py-6">
      {/* Toolbar */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">My CV</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/cv-builder"
            className="rounded-pill border border-border px-4 py-1.5 text-[0.8125rem] font-bold text-ink transition-colors hover:bg-surface-2"
          >
            Edit
          </Link>
          <Link
            href="/cv-print"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-pill border border-border px-4 py-1.5 text-[0.8125rem] font-bold text-ink transition-colors hover:bg-surface-2"
          >
            Download PDF
          </Link>
          <a
            href="/api/cv/docx"
            className="rounded-pill bg-ink px-4 py-1.5 text-[0.8125rem] font-bold text-canvas transition-colors hover:opacity-80"
          >
            Download Word
          </a>
        </div>
      </div>

      {/* Grounding notice */}
      <p className="mb-4 text-[0.8125rem] text-muted">
        This built CV is what Cyclops uses to ground your cover letters and answers.
      </p>

      {/* CV Preview */}
      <div className="rounded-card border border-border bg-surface p-6 shadow-card">
        <CvDocument cv={built.cv} />
      </div>
    </div>
  );
}
