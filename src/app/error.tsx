"use client";

// error.tsx — top-level segment error boundary. It renders INSIDE the root
// layout, so the app's fonts and global CSS are available and we use the normal
// design-system primitives (mirrors not-found.tsx). It must never show a
// stranger a raw stack trace; only the opaque digest may appear as a support id.
//
// Kept intentionally declarative; the only logic (deriving a safe support id)
// lives in the unit-tested helper. Runtime catch behaviour needs live checking.

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  GENERIC_ERROR_BODY,
  GENERIC_ERROR_TITLE,
  safeSupportRef,
} from "@/lib/error-display";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server/telemetry only — never rendered to the user.
    console.error("[error-boundary]", error);
  }, [error]);

  const ref = safeSupportRef(error);

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-24 text-center">
      <span className="text-sm font-semibold text-accent">Hmm</span>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
        {GENERIC_ERROR_TITLE}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">{GENERIC_ERROR_BODY}</p>
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/today">
          <Button variant="secondary">Back to safety</Button>
        </Link>
      </div>
      {ref ? (
        <p className="mt-4 text-xs text-subtle">Reference: {ref}</p>
      ) : null}
    </div>
  );
}
