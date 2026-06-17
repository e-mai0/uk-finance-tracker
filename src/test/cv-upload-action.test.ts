// src/test/cv-upload-action.test.ts
//
// U3 — fast CV upload. Pins the server-side contract for uploadCvAction:
//   1. The two independent LLM calls (facts extraction + CV parse) run
//      CONCURRENTLY, not serially.
//   2. A failure in the best-effort facts call does NOT abort the parse/persist.
//   3. The Settings caller path is preserved (revalidatePath("/settings")).
//   4. Upload seeds the CV coach opening with the parsed CV + the cv session id.
//   5. The return shape carries the parsed `cv` for an in-place client update,
//      while keeping `ok`/`cvParsed` so the Settings caller is unaffected.
//
// Harness mirrors cv-draft-action.test.ts: vitest + hoisted mocks of the same
// cv server seams (auth, next/cache, store, coach, generate, facts) plus the
// storage + parse seams uploadCvAction depends on.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { auth } from "@/server/auth";
import { revalidatePath } from "next/cache";

vi.mock("server-only", () => ({}));

const {
  storageConfigured,
  uploadCv,
  removeCv,
  extractCvText,
  extractFacts,
  parseCv,
  persist,
  ensureSession,
  seedCoach,
} = vi.hoisted(() => ({
  storageConfigured: vi.fn(),
  uploadCv: vi.fn(),
  removeCv: vi.fn(),
  extractCvText: vi.fn(),
  extractFacts: vi.fn(),
  parseCv: vi.fn(),
  persist: vi.fn(),
  ensureSession: vi.fn(),
  seedCoach: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/db", () => ({
  prisma: { applyProfile: { upsert: vi.fn().mockResolvedValue({}) } },
}));
vi.mock("@/server/storage", () => ({
  storageConfigured,
  uploadCv,
  removeCv,
}));
vi.mock("@/server/cv/parse", () => ({ extractCvText }));
vi.mock("@/server/cv/facts", () => ({ extractCvFactsToMemory: extractFacts }));
vi.mock("@/server/cv/generate", () => ({ parseCvTextToCvData: parseCv }));
vi.mock("@/server/cv/store", () => ({
  persistCv: persist,
  ensureCvChatSession: ensureSession,
}));
vi.mock("@/server/cv/coach", () => ({ seedCoachOpening: seedCoach }));

import { uploadCvAction } from "@/server/actions/applyProfile";
import { cvDataSchema, type CvData } from "@/lib/cv";

const PARSED_CV: CvData = cvDataSchema.parse({
  fullName: "Eric Mai",
  education: [{ institution: "Cambridge", qualification: "Economics BA" }],
});

function makeFormData(): FormData {
  const fd = new FormData();
  const file = new File([new Uint8Array([1, 2, 3])], "cv.pdf", { type: "application/pdf" });
  fd.set("cv", file);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
  storageConfigured.mockReturnValue(true);
  uploadCv.mockResolvedValue("u1/cv.pdf");
  extractCvText.mockResolvedValue("CV TEXT");
  extractFacts.mockResolvedValue(undefined);
  parseCv.mockResolvedValue(PARSED_CV);
  persist.mockResolvedValue(PARSED_CV);
  ensureSession.mockResolvedValue("sess-1");
  seedCoach.mockResolvedValue({ seeded: true, clientId: "coach-opening:sess-1" });
});

describe("uploadCvAction — happy path", () => {
  it("parses, persists and returns the parsed CV plus ok/cvParsed", async () => {
    const res = await uploadCvAction(makeFormData());
    expect(res.ok).toBe(true);
    expect(res.cvParsed).toBe(true);
    // Additive: the parsed CV is returned so the client can update in place.
    expect(res.cv?.fullName).toBe("Eric Mai");
    expect(parseCv).toHaveBeenCalledWith("u1", "CV TEXT");
    expect(persist).toHaveBeenCalledWith("u1", PARSED_CV);
  });

  it("revalidates the /settings path (Settings caller unaffected)", async () => {
    await uploadCvAction(makeFormData());
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("seeds the CV coach opening with the parsed CV + the cv session id", async () => {
    const res = await uploadCvAction(makeFormData());
    expect(res.ok).toBe(true);
    expect(ensureSession).toHaveBeenCalledWith("u1");
    expect(seedCoach).toHaveBeenCalledOnce();
    const arg = seedCoach.mock.calls[0][0];
    expect(arg.userId).toBe("u1");
    expect(arg.sessionId).toBe("sess-1");
    // The coach must receive the persisted/parsed CV (so its assessment is grounded).
    expect(arg.cv.fullName).toBe("Eric Mai");
  });
});

describe("uploadCvAction — concurrency", () => {
  it("runs facts extraction and CV parse CONCURRENTLY, not serially", async () => {
    // Deferred promises: neither call resolves until BOTH have been entered.
    // If the action awaited them serially, the second mock would never be
    // entered while the first is still pending, and this would hang/time out.
    let resolveFacts!: () => void;
    let resolveParse!: (cv: CvData) => void;
    let factsEntered = false;
    let parseEntered = false;
    let bothEnteredBeforeEitherResolved = false;

    extractFacts.mockImplementation(async () => {
      factsEntered = true;
      if (factsEntered && parseEntered) bothEnteredBeforeEitherResolved = true;
      await new Promise<void>((r) => {
        resolveFacts = r;
      });
    });
    parseCv.mockImplementation(async () => {
      parseEntered = true;
      if (factsEntered && parseEntered) bothEnteredBeforeEitherResolved = true;
      await new Promise<CvData>((r) => {
        resolveParse = r as (cv: CvData) => void;
      });
      return PARSED_CV;
    });

    const promise = uploadCvAction(makeFormData());

    // Let microtasks flush so both async calls get a chance to be entered.
    await new Promise((r) => setTimeout(r, 0));

    expect(factsEntered).toBe(true);
    expect(parseEntered).toBe(true);
    expect(bothEnteredBeforeEitherResolved).toBe(true);

    // Now release both so the action can finish.
    resolveParse(PARSED_CV);
    resolveFacts();
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(res.cvParsed).toBe(true);
  });
});

describe("uploadCvAction — facts failure is best-effort", () => {
  it("a thrown facts error does NOT prevent the parse/persist or returning the CV", async () => {
    extractFacts.mockRejectedValue(new Error("facts LLM exploded"));
    const res = await uploadCvAction(makeFormData());
    expect(res.ok).toBe(true);
    expect(res.cvParsed).toBe(true);
    expect(res.cv?.fullName).toBe("Eric Mai");
    expect(persist).toHaveBeenCalledWith("u1", PARSED_CV);
    expect(seedCoach).toHaveBeenCalledOnce();
  });
});

describe("uploadCvAction — parse failure", () => {
  it("keeps the upload but does not mark cvParsed or seed the coach when parse returns null", async () => {
    parseCv.mockResolvedValue(null);
    const res = await uploadCvAction(makeFormData());
    expect(res.ok).toBe(true);
    expect(res.cvParsed).toBe(false);
    expect(res.cv).toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
    expect(seedCoach).not.toHaveBeenCalled();
    // Settings path still fires.
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("a thrown parse error is caught: upload survives, cvParsed false", async () => {
    parseCv.mockRejectedValue(new Error("parse LLM exploded"));
    const res = await uploadCvAction(makeFormData());
    expect(res.ok).toBe(true);
    expect(res.cvParsed).toBe(false);
    expect(res.cv).toBeUndefined();
  });
});
