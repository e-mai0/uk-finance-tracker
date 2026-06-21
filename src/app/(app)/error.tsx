"use client";

// (app)/error.tsx — error boundary for the authed app shell. Catching here keeps
// the user inside the app chrome (nav stays) instead of bubbling to the bare
// top-level boundary, so recovery feels in-context. Same contract as the
// top-level boundary: never leak the message/stack; only the opaque digest may
// show as a support id. Trivial by design — logic lives in the tested helper.

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  GENERIC_ERROR_BODY,
  GENERIC_ERROR_TITLE,
  safeSupportRef,
} from "@/lib/error-display";

export default function AppShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server/telemetry only — never rendered to the user.
    console.error("[app-error-boundary]", error);
  }, [error]);

  const ref = safeSupportRef(error);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <span className="text-sm font-semibold text-accent">Hmm</span>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
        {GENERIC_ERROR_TITLE}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">{GENERIC_ERROR_BODY}</p>
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/today">
          <Button variant="secondary">Back to Today</Button>
        </Link>
      </div>
      {ref ? (
        <p className="mt-4 text-xs text-subtle">Reference: {ref}</p>
      ) : null}
    </div>
  );
}
