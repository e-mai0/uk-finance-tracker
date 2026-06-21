// src/test/error-display.test.ts
//
// U1 Part A — pure, testable core of the error boundaries.
//
// The error-boundary COMPONENTS are deliberately trivial (a React tree we can
// only fully exercise at runtime). All the decision logic that COULD leak a
// stack trace or a raw message to a stranger lives here, in a pure function we
// can test exhaustively. The reviewer's hard rule: the user-visible surface
// must NEVER carry error.message / error.stack.
import { describe, expect, it } from "vitest";
import { safeSupportRef, GENERIC_ERROR_BODY, GENERIC_ERROR_TITLE } from "@/lib/error-display";

describe("safeSupportRef", () => {
  it("returns the digest when present (digest is opaque and safe to show)", () => {
    const err = Object.assign(new Error("DB password = hunter2"), {
      digest: "abc123",
    });
    expect(safeSupportRef(err)).toBe("abc123");
  });

  it("returns null when there is no digest", () => {
    expect(safeSupportRef(new Error("kaboom"))).toBeNull();
  });

  it("returns null for a non-Error / undefined value", () => {
    expect(safeSupportRef(undefined)).toBeNull();
    expect(safeSupportRef("a raw string error")).toBeNull();
    expect(safeSupportRef({ message: "secret" })).toBeNull();
  });

  it("NEVER returns the error message or stack, even when a digest exists", () => {
    const err = Object.assign(new Error("SELECT * leaked secret token=xyz"), {
      digest: "ref-9",
      stack: "Error: secret\n at /app/server/db.ts:42",
    });
    const ref = safeSupportRef(err);
    expect(ref).toBe("ref-9");
    expect(ref).not.toContain("secret");
    expect(ref).not.toContain("token");
    expect(ref).not.toContain("db.ts");
  });

  it("ignores a non-string digest (defensive — only opaque string ids pass)", () => {
    const err = Object.assign(new Error("x"), { digest: 12345 });
    expect(safeSupportRef(err)).toBeNull();
  });

  it("ignores an empty / whitespace-only digest", () => {
    const err = Object.assign(new Error("x"), { digest: "   " });
    expect(safeSupportRef(err)).toBeNull();
  });
});

describe("generic copy constants", () => {
  it("are on-brand, non-empty, and reveal nothing technical", () => {
    expect(GENERIC_ERROR_TITLE.length).toBeGreaterThan(0);
    expect(GENERIC_ERROR_BODY.length).toBeGreaterThan(0);
    // No leaked technical jargon a stranger shouldn't see.
    expect(GENERIC_ERROR_BODY.toLowerCase()).not.toContain("stack");
    expect(GENERIC_ERROR_BODY.toLowerCase()).not.toContain("exception");
    expect(GENERIC_ERROR_BODY.toLowerCase()).not.toContain("undefined");
  });
});
