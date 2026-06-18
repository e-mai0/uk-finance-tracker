// src/components/cv/cv-preview-pane.tsx
// Seam component (U0 refactor): the "My CV" preview pane.
// Wraps <CvDocument> in the scrollable card chrome used on /cv.
//
// Prop contract:
//   { cv: CvData }  — the live CV to render. The owning shell lifts/updates
//   `cv` (from <CvChat onCvUpdate>) and passes the current value down.
//
// Owned by U0. No other unit edits this file in Cycle 5.
"use client";

import { CvDocument } from "@/components/cv/cv-document";
import type { CvData } from "@/lib/cv";

export function CvPreviewPane({ cv }: { cv: CvData }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-2xl rounded-card border border-border bg-surface p-6 shadow-card">
        <CvDocument cv={cv} />
      </div>
    </div>
  );
}
