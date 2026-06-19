// src/test/auth-signup.test.ts
//
// Cycle 6 F1 — signup must NOT silently no-op when the early-access gate is OFF.
//
// When EARLY_ACCESS_CODE is unset, the signup form renders NO inviteCode input,
// so `formData.get("inviteCode")` is `null`. `signupSchema`'s
// `inviteCode: z.string().optional()` accepts `undefined` but REJECTS `null`,
// turning a valid gate-off signup into a parse failure (a fieldError that has
// nowhere to render) → "Create account" silently does nothing.
//
// This pins the schema contract directly (the deterministic seam the action
// runs `safeParse` against): a missing/null inviteCode must PARSE, and a real
// code must still parse + survive intact (gate-on validation is unchanged and
// lives in signupAction, exercised separately below).
import { describe, it, expect } from "vitest";
import { signupSchema } from "@/lib/validation";

const BASE = {
  name: "Eric Mai",
  email: "eric@example.com",
  password: "hunter2hunter2",
};

describe("signupSchema — inviteCode null/undefined coercion (F1)", () => {
  it("parses when inviteCode is null (gate OFF: form omits the field, FormData.get returns null)", () => {
    // This is the exact shape signupAction builds: formData.get("inviteCode")
    // is `null` when the field is not rendered.
    const parsed = signupSchema.safeParse({ ...BASE, inviteCode: null });
    expect(parsed.success).toBe(true);
    // The coerced value must be undefined (absent), never the literal null —
    // so the gate-on compare `(inviteCode ?? "")` behaves as "no code given".
    if (parsed.success) expect(parsed.data.inviteCode).toBeUndefined();
  });

  it("parses when inviteCode is undefined (field genuinely absent)", () => {
    const parsed = signupSchema.safeParse({ ...BASE });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.inviteCode).toBeUndefined();
  });

  it("still accepts and preserves a real invite code (gate ON path)", () => {
    const parsed = signupSchema.safeParse({ ...BASE, inviteCode: "cyclops-02ddfd" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.inviteCode).toBe("cyclops-02ddfd");
  });

  it("trims a provided invite code (gate-on compare is trim+case-insensitive)", () => {
    const parsed = signupSchema.safeParse({ ...BASE, inviteCode: "  CODE  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.inviteCode).toBe("CODE");
  });

  it("still rejects an over-long invite code (the max(100) bound is preserved)", () => {
    const parsed = signupSchema.safeParse({ ...BASE, inviteCode: "x".repeat(101) });
    expect(parsed.success).toBe(false);
  });
});
