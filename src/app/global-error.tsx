"use client";

// global-error.tsx — the LAST line of defence. It catches errors thrown in the
// root layout itself, so it REPLACES <html>/<body> and cannot assume the app's
// fonts, providers, or global CSS are available. Everything here is therefore
// inline and self-contained. It must never show a stranger a raw stack trace.
//
// Kept intentionally trivial; the only logic (deriving a safe support id) lives
// in the unit-tested helper. Runtime catch behaviour needs live verification.

import { useEffect } from "react";
import {
  GENERIC_ERROR_BODY,
  GENERIC_ERROR_TITLE,
  safeSupportRef,
} from "@/lib/error-display";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server/telemetry only — never rendered to the user.
    console.error("[global-error]", error);
  }, [error]);

  const ref = safeSupportRef(error);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          textAlign: "center",
          background: "#fbfbf9",
          color: "#1a1a1a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
          {GENERIC_ERROR_TITLE}
        </h1>
        <p
          style={{
            marginTop: "0.5rem",
            maxWidth: "28rem",
            fontSize: "0.9rem",
            lineHeight: 1.5,
            color: "#5b5b57",
          }}
        >
          {GENERIC_ERROR_BODY}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: "1.5rem",
            cursor: "pointer",
            borderRadius: "9999px",
            border: "none",
            background: "#1a1a1a",
            color: "#fbfbf9",
            padding: "0.625rem 1.25rem",
            fontSize: "0.8125rem",
            fontWeight: 800,
          }}
        >
          Try again
        </button>
        {ref ? (
          <p style={{ marginTop: "1rem", fontSize: "0.7rem", color: "#9a9a96" }}>
            Reference: {ref}
          </p>
        ) : null}
      </body>
    </html>
  );
}
