/**
 * Tests for the /api/ext/application route — apply-record contract.
 *
 * Mirrors the mock-based harness from start-application.test.ts:
 * - vi.hoisted to declare mock fns before vi.mock hoisting occurs
 * - @/server/db mocked with the relevant prisma operations
 * - @/server/ext-auth mocked so requireToken resolves/rejects per test
 * - server-only modules (ext-http, server/db, ext-auth) use module mocks to
 *   avoid the "server-only" guard that throws in a vitest node environment
 *
 * Acceptance criteria being pinned:
 *   1. Re-applying same (userId, externalUrl) twice → exactly 1 Application row (upsert dedup)
 *   2. submittedAt is set for SUBMITTED; null/unset for non-submitted
 *   3. Timestamp preservation: AUTOFILLED→SUBMITTED→AUTOFILLED must NOT corrupt submittedAt
 *   4. No matching opportunity → record created cleanly with opportunityId null
 *   5. Invalid/missing trk_ token is rejected with 401
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mocks so they are available before vi.mock() factory runs
// ---------------------------------------------------------------------------
const { upsert, findFirst, requireTokenMock } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findFirst: vi.fn(),
  requireTokenMock: vi.fn(),
}));

// Mock server-only modules before importing route
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  prisma: {
    application: { upsert },
    opportunity: { findFirst },
  },
}));
vi.mock("@/server/ext-auth", () => ({
  requireToken: requireTokenMock,
}));

// Import the route handler AFTER mocks are set up
import { POST } from "@/app/api/ext/application/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid POST request to /api/ext/application. */
function makeRequest(body: Record<string, unknown>, token = "trk_validtoken"): Request {
  return new Request("http://localhost/api/ext/application", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  externalUrl: "https://greenhouse.io/jobs/123",
  ats: "GREENHOUSE",
  employerName: "Acme Bank",
  roleTitle: "Software Engineer Intern",
  status: "AUTOFILLED",
};

const USER_ID = "user-abc";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  // Default: valid authenticated user
  requireTokenMock.mockResolvedValue({ userId: USER_ID });
  // Default: no matching opportunity
  findFirst.mockResolvedValue(null);
  // Default: upsert returns a plausible record
  upsert.mockResolvedValue({ id: "app-1", status: "AUTOFILLED" });
});

// ---------------------------------------------------------------------------
// Acceptance 1: Upsert dedup — same (userId, externalUrl) twice → 1 row
// ---------------------------------------------------------------------------

describe("upsert dedup", () => {
  it("calls upsert with the composite unique key so that re-applying the same URL results in exactly one row", async () => {
    upsert.mockResolvedValue({ id: "app-1", status: "AUTOFILLED" });

    // First call
    const res1 = await POST(makeRequest(VALID_BODY));
    expect(res1.status).toBe(200);

    // Second call with identical payload
    const res2 = await POST(makeRequest(VALID_BODY));
    expect(res2.status).toBe(200);

    // Both calls must use upsert (not create), keyed on userId + externalUrl.
    // Upsert is idempotent at the DB level — only one row is created regardless.
    expect(upsert).toHaveBeenCalledTimes(2);
    for (const call of upsert.mock.calls) {
      const [arg] = call;
      expect(arg.where).toEqual({
        userId_externalUrl: {
          userId: USER_ID,
          externalUrl: VALID_BODY.externalUrl,
        },
      });
    }
  });

  it("returns the applicationId and status from the upserted record", async () => {
    upsert.mockResolvedValue({ id: "app-42", status: "AUTOFILLED" });

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(body).toEqual({ ok: true, applicationId: "app-42", status: "AUTOFILLED" });
  });
});

// ---------------------------------------------------------------------------
// Acceptance 2: submittedAt set on SUBMITTED; absent for non-submitted
// ---------------------------------------------------------------------------

describe("submittedAt contract", () => {
  it("passes a Date for submittedAt when status is SUBMITTED", async () => {
    upsert.mockResolvedValue({ id: "app-1", status: "SUBMITTED" });
    const before = new Date();

    await POST(makeRequest({ ...VALID_BODY, status: "SUBMITTED" }));

    const callArg = upsert.mock.calls[0][0];
    // submittedAt must be present and be a recent Date in both create and update
    expect(callArg.create.submittedAt).toBeInstanceOf(Date);
    expect(callArg.update.submittedAt).toBeInstanceOf(Date);
    expect(callArg.create.submittedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("passes undefined for submittedAt when status is AUTOFILLED", async () => {
    await POST(makeRequest({ ...VALID_BODY, status: "AUTOFILLED" }));

    const callArg = upsert.mock.calls[0][0];
    expect(callArg.create.submittedAt).toBeUndefined();
    expect(callArg.update.submittedAt).toBeUndefined();
  });

});

// ---------------------------------------------------------------------------
// Acceptance 3: Timestamp preservation — AUTOFILLED → SUBMITTED → AUTOFILLED
//
// The critical invariant: once submittedAt is set (by a SUBMITTED update),
// a subsequent non-SUBMITTED re-apply must NOT overwrite it.
//
// The route achieves this by passing `submittedAt: undefined` in the update
// payload for non-SUBMITTED statuses. Prisma interprets undefined as "skip
// this field" and leaves the stored value intact. We pin this by asserting
// that the update block contains `submittedAt: undefined` — NOT `null` —
// so that Prisma's behavior (skip vs. explicit null) is correct.
// ---------------------------------------------------------------------------

describe("submittedAt preservation on re-apply", () => {
  it("passes undefined (not null) for submittedAt on a non-SUBMITTED re-apply, preserving the DB value", async () => {
    // Simulate the third step: AUTOFILLED re-apply after submittedAt was already set.
    // The route must pass undefined so Prisma skips the field; passing null would
    // corrupt an existing submittedAt.
    upsert.mockResolvedValue({ id: "app-1", status: "AUTOFILLED" });

    await POST(makeRequest({ ...VALID_BODY, status: "AUTOFILLED" }));

    const callArg = upsert.mock.calls[0][0];
    // undefined → Prisma skips the field (preserves stored value)
    // null      → would explicitly nullify a previously-set submittedAt (WRONG)
    expect(callArg.update.submittedAt).toBeUndefined();
    expect(callArg.update.submittedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Acceptance 4: No matching opportunity → opportunityId is null
// ---------------------------------------------------------------------------

describe("opportunityId when no opportunity matches", () => {
  it("creates the record with opportunityId null when no opportunity matches the externalUrl", async () => {
    findFirst.mockResolvedValue(null); // no matching opportunity

    await POST(makeRequest(VALID_BODY));

    const callArg = upsert.mock.calls[0][0];
    expect(callArg.create.opportunityId).toBeNull();
  });

  it("returns ok:true even when no opportunity is linked", async () => {
    findFirst.mockResolvedValue(null);
    upsert.mockResolvedValue({ id: "app-solo", status: "AUTOFILLED" });

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.applicationId).toBe("app-solo");
  });

  it("links the opportunity when one matches", async () => {
    findFirst.mockResolvedValue({ id: "opp-99" });

    await POST(makeRequest(VALID_BODY));

    const callArg = upsert.mock.calls[0][0];
    expect(callArg.create.opportunityId).toBe("opp-99");
    // update path should also set opportunityId (non-undefined)
    expect(callArg.update.opportunityId).toBe("opp-99");
  });

  it("queries opportunity by the externalUrl sent in the body", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { applicationUrl: VALID_BODY.externalUrl },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Acceptance 5: Invalid / missing token is rejected with 401
// ---------------------------------------------------------------------------

describe("token authentication", () => {
  it("returns 401 when requireToken resolves null (invalid token)", async () => {
    requireTokenMock.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY, "trk_invalid"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 401 when no Authorization header is provided", async () => {
    requireTokenMock.mockResolvedValue(null);

    const req = new Request("http://localhost/api/ext/application", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

});

// ---------------------------------------------------------------------------
// Edge: validation rejects malformed bodies
// ---------------------------------------------------------------------------

describe("request validation", () => {
  it("returns 400 when externalUrl is not a valid URL", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, externalUrl: "not-a-url" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 400 when externalUrl is missing", async () => {
    const { externalUrl: _, ...bodyWithout } = VALID_BODY;
    const res = await POST(makeRequest(bodyWithout));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 400 when status is an invalid enum value", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, status: "APPLIED" }));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/ext/application", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer trk_validtoken",
      },
      body: "this is not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("defaults status to AUTOFILLED when not provided", async () => {
    const { status: _, ...bodyWithoutStatus } = VALID_BODY;
    upsert.mockResolvedValue({ id: "app-1", status: "AUTOFILLED" });

    await POST(makeRequest(bodyWithoutStatus));

    const callArg = upsert.mock.calls[0][0];
    expect(callArg.create.status).toBe("AUTOFILLED");
    expect(callArg.update.status).toBe("AUTOFILLED");
  });
});
