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
  applyProfileUpsert,
  applyProfileFindUnique,
  applyProfileUpdate,
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
  applyProfileUpsert: vi.fn(),
  applyProfileFindUnique: vi.fn(),
  applyProfileUpdate: vi.fn(),
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
  prisma: {
    applyProfile: {
      upsert: applyProfileUpsert,
      findUnique: applyProfileFindUnique,
      update: applyProfileUpdate,
    },
  },
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

import { clearCvAction, uploadCvAction } from "@/server/actions/applyProfile";
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
  removeCv.mockResolvedValue(undefined);
  applyProfileUpsert.mockResolvedValue({});
  applyProfileFindUnique.mockResolvedValue({
    userId: "u1",
    cvStoragePath: "u1/cv.pdf",
  });
  applyProfileUpdate.mockResolvedValue({});
  extractCvText.mockResolvedValue("CV TEXT");
  extractFacts.mockResolvedValue(undefined);
  parseCv.mockResolvedValue(PARSED_CV);
  persist.mockResolvedValue(PARSED_CV);
  ensureSession.mockResolvedValue("sess-1");
  seedCoach.mockResolvedValue({
    seeded: true,
    clientId: "coach-opening:sess-1",
    // F2: the seeded opening as a UIMessage (assessment text + exactly 3 chips).
    message: {
      id: "coach-opening:sess-1",
      role: "assistant",
      parts: [
        { type: "text", text: "I read your CV — strong projects, thin experience." },
        {
          type: "data-coach-chips",
          data: {
            chips: [
              { label: "Add a summary", prompt: "Draft a summary." },
              { label: "Sharpen bullets", prompt: "Rewrite my bullets for impact." },
              { label: "Tailor to a role", prompt: "Tailor my CV to a finance internship." },
            ],
          },
        },
      ],
    },
  });
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

  // F2: the action must additively RETURN the seeded coach opening so the /cv
  // client can render the assessment + chips IN PLACE on the empty→has-CV
  // upload transition (no full reload, no refetch). This is the headline
  // "upload → get coached" moment that was previously silent on first paint.
  it("returns the seeded coach opening (assessment text + exactly 3 chips)", async () => {
    const res = await uploadCvAction(makeFormData());
    expect(res.coachOpening).toBeDefined();
    const opening = res.coachOpening!;
    // UIMessage shape: stable id (= dedup clientId) + assistant role + parts.
    expect(opening.role).toBe("assistant");
    expect(opening.id).toBe("coach-opening:sess-1");
    const textPart = opening.parts.find((p) => p.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    expect(textPart?.text && textPart.text.length).toBeTruthy();
    const chipPart = opening.parts.find((p) => p.type === "data-coach-chips") as
      | { type: "data-coach-chips"; data: { chips: unknown[] } }
      | undefined;
    expect(chipPart).toBeDefined();
    expect(chipPart!.data.chips).toHaveLength(3);
  });

  it("the Settings caller contract is preserved (ok/cvParsed present regardless of the additive coachOpening)", async () => {
    const res = await uploadCvAction(makeFormData());
    expect(res.ok).toBe(true);
    expect(res.cvParsed).toBe(true);
    // coachOpening is purely additive — Settings ignores it; the existing
    // fields it relies on are unchanged.
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

describe("clearCvAction", () => {
  it("removes the stored object before clearing CV metadata", async () => {
    const res = await clearCvAction();

    expect(res.ok).toBe(true);
    expect(removeCv).toHaveBeenCalledWith("u1/cv.pdf");
    expect(applyProfileUpdate).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: {
        cvStoragePath: null,
        cvFileName: null,
        cvFileSize: null,
        cvText: null,
        cvUpdatedAt: null,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("does not clear the DB pointer when storage deletion fails", async () => {
    removeCv.mockRejectedValue(new Error("storage unavailable"));

    const res = await clearCvAction();

    expect(res.error).toBeTruthy();
    expect(applyProfileUpdate).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
