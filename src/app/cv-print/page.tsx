// src/app/cv-print/page.tsx
// Minimal, chrome-free print view for the CV.
// Self-guards with auth(). Renders only the CV document with print CSS and
// auto-invokes window.print() on mount so the user gets the browser's
// Save-as-PDF dialog. No PDF library needed.
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getBuiltCv } from "@/server/cv/store";
import { CvDocument } from "@/components/cv/cv-document";
import { PrintTrigger } from "@/components/cv/print-trigger";

export const dynamic = "force-dynamic";
export const metadata = { title: "CV — Print" };

export default async function CvPrintPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const built = await getBuiltCv(session.user.id);
  if (!built) redirect("/cv-builder");

  return (
    <>
      <PrintTrigger />
      <div className="cv-print-wrapper">
        <CvDocument cv={built.cv} />
      </div>
    </>
  );
}
