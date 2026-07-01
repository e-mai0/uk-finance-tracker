// src/test/account-storage-review.test.ts
//
// ADVERSARIAL-REVIEW held-out tests for the GDPR CV-storage completeness unit.
// Written independently of the author's tests, with a deliberately DIFFERENT
// seam: the author's account/apply-profile tests mock `@/server/storage`
// wholesale, so none of them prove the composed behavior through the REAL
// storage module. These tests mock ONLY `@supabase/supabase-js` and drive the
// real `src/server/storage.ts` from the real server actions — pinning exactly
// the failure mode this unit exists to fix (supabase-js reports failures via a
// returned `{ error }` and never throws).
//
// What each block pins:
//  1. deleteAccount × real sweep: a supabase list/remove `{ error }` (no throw)
//     ABORTS deletion — zero prisma writes, no sign-out; a multi-object folder
//     is removed in full BEFORE any DB write; an already-empty folder (stale DB
//     pointer) still deletes cleanly, which is what makes the disclosed
//     "sweep succeeded, tx failed, user retries" story actually re-runnable.
//  2. exportMyData × real downloadCv: `{ data: null, error: null }` (supabase
//     returning neither data nor error) degrades to an explicit in-payload
//     note; an EMPTY blob is still a faithful available:true export; binary
//     content survives the base64 round-trip byte-for-byte.
//  3. clearCvAction × real removeCv: storage env missing + a CV on record →
//     the action fails and the DB pointer SURVIVES (no claims-gone-but-lives
//     divergence, no permanently orphaned object).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  fromMock: vi.fn(),
  listMock: vi.fn(),
  removeMock: vi.fn(),
  downloadMock: vi.fn(),
  uploadMock: vi.fn(),
  authMock: vi.fn(),
  signOutMock: vi.fn(),
  txMock: vi.fn(),
  userDelete: vi.fn(),
  userFindUnique: vi.fn(),
  profileFindUnique: vi.fn(),
  preferencesFindUnique: vi.fn(),
  applyProfileFindUnique: vi.fn(),
  applyProfileUpdate: vi.fn(),
  applyProfileUpsert: vi.fn(),
  builtCvFindUnique: vi.fn(),
  findManyEmpty: vi.fn(),
  deleteManySpy: vi.fn(),
  // records the interleaving of storage ops vs prisma writes
  order: [] as string[],
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: h.createClientMock }));

vi.mock("@/server/auth", () => ({ auth: h.authMock, signOut: h.signOutMock }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// applyProfile.ts pulls in the CV pipeline at module load; none of it is under
// test here. @/server/storage is deliberately NOT mocked — it stays real.
vi.mock("@/server/cv/parse", () => ({ extractCvText: vi.fn() }));
vi.mock("@/server/cv/facts", () => ({ extractCvFactsToMemory: vi.fn() }));
vi.mock("@/server/cv/generate", () => ({ parseCvTextToCvData: vi.fn() }));
vi.mock("@/server/cv/store", () => ({
  persistCv: vi.fn(),
  ensureCvChatSession: vi.fn(),
}));
vi.mock("@/server/cv/coach", () => ({ seedCoachOpening: vi.fn() }));

const trackedDeleteMany = (label: string) =>
  vi.fn(async (...args: unknown[]) => {
    h.order.push(label);
    h.deleteManySpy(label, ...args);
    return {};
  });

const txClient = {
  gardenerQuestion: { deleteMany: trackedDeleteMany("gardenerQuestion") },
  gardenerRun: { deleteMany: trackedDeleteMany("gardenerRun") },
  dailyUsage: { deleteMany: trackedDeleteMany("dailyUsage") },
  draftEdit: { deleteMany: trackedDeleteMany("draftEdit") },
  contentEmbedding: { deleteMany: trackedDeleteMany("contentEmbedding") },
  user: {
    delete: vi.fn(async (...args: unknown[]) => {
      h.order.push("user.delete");
      h.userDelete(...args);
      return {};
    }),
  },
};

vi.mock("@/server/db", () => ({
  prisma: {
    $transaction: (cb: (tx: typeof txClient) => unknown) => {
      h.txMock(cb);
      return cb(txClient);
    },
    user: { findUnique: h.userFindUnique },
    profile: { findUnique: h.profileFindUnique },
    preferences: { findUnique: h.preferencesFindUnique },
    applyProfile: {
      findUnique: h.applyProfileFindUnique,
      update: h.applyProfileUpdate,
      upsert: h.applyProfileUpsert,
    },
    builtCv: { findUnique: h.builtCvFindUnique },
    savedOpportunity: { findMany: h.findManyEmpty },
    matchScore: { findMany: h.findManyEmpty },
    answerBankItem: { findMany: h.findManyEmpty },
    application: { findMany: h.findManyEmpty },
    generatedDraft: { findMany: h.findManyEmpty },
    memoryFile: { findMany: h.findManyEmpty },
    chatSession: { findMany: h.findManyEmpty },
    attentionItem: { findMany: h.findManyEmpty },
    apiToken: { findMany: h.findManyEmpty },
    gardenerQuestion: { findMany: h.findManyEmpty },
    dailyUsage: { findMany: h.findManyEmpty },
  },
}));

const USER_ID = "review-user-1";

function configureStorageEnv(configured: boolean) {
  if (configured) {
    process.env.SUPABASE_URL = "https://review.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "review-service-role";
  } else {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  h.order.length = 0;
  configureStorageEnv(true);

  h.authMock.mockResolvedValue({ user: { id: USER_ID, email: "r@x.com" } });
  h.signOutMock.mockResolvedValue(undefined);
  h.userFindUnique.mockResolvedValue({ id: USER_ID, passwordHash: "secret" });
  h.profileFindUnique.mockResolvedValue(null);
  h.preferencesFindUnique.mockResolvedValue(null);
  h.applyProfileFindUnique.mockResolvedValue(null);
  h.applyProfileUpdate.mockResolvedValue({});
  h.builtCvFindUnique.mockResolvedValue(null);
  h.findManyEmpty.mockResolvedValue([]);

  h.fromMock.mockReturnValue({
    list: h.listMock,
    remove: h.removeMock,
    download: h.downloadMock,
    upload: h.uploadMock,
  });
  h.createClientMock.mockReturnValue({ storage: { from: h.fromMock } });
  h.listMock.mockImplementation(async (...args: unknown[]) => {
    h.order.push(`storage.list(${String(args[0])})`);
    return { data: [], error: null };
  });
  h.removeMock.mockImplementation(async () => {
    h.order.push("storage.remove");
    return { data: [], error: null };
  });
  h.downloadMock.mockResolvedValue({ data: null, error: null });
});

// ————————————————————————————————————————————————————————————————————————————
// deleteAccount composed with the REAL storage sweep
// ————————————————————————————————————————————————————————————————————————————

describe("deleteAccount through the real storage module", () => {
  it("supabase list returning { error } (no throw) ABORTS deletion: zero prisma writes, no sign-out", async () => {
    h.listMock.mockResolvedValue({
      data: null,
      error: { message: "service unavailable" },
    });
    const { deleteAccount } = await import("@/server/actions/account");

    const res = await deleteAccount({ confirm: "DELETE" });

    expect(res.ok).not.toBe(true);
    expect(res.error).toBeTruthy();
    expect(h.txMock).not.toHaveBeenCalled();
    expect(h.deleteManySpy).not.toHaveBeenCalled();
    expect(h.userDelete).not.toHaveBeenCalled();
    expect(h.signOutMock).not.toHaveBeenCalled();
    expect(h.removeMock).not.toHaveBeenCalled();
  });

  it("supabase remove returning { error } after a successful list ALSO aborts (fail-closed end-to-end)", async () => {
    h.listMock.mockResolvedValue({
      data: [{ name: "cv.pdf" }],
      error: null,
    });
    h.removeMock.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    const { deleteAccount } = await import("@/server/actions/account");

    const res = await deleteAccount({ confirm: "DELETE" });

    expect(res.ok).not.toBe(true);
    expect(res.error).toBeTruthy();
    expect(h.txMock).not.toHaveBeenCalled();
    expect(h.deleteManySpy).not.toHaveBeenCalled();
    expect(h.userDelete).not.toHaveBeenCalled();
    expect(h.signOutMock).not.toHaveBeenCalled();
  });

  it("a MULTI-object folder (stranded replacements) is removed in full, before any DB write, then rows + sign-out", async () => {
    h.listMock.mockImplementation(async (...args: unknown[]) => {
      h.order.push(`storage.list(${String(args[0])})`);
      return {
        data: [{ name: "cv.pdf" }, { name: "cv.docx" }, { name: "cv.txt" }],
        error: null,
      };
    });
    const { deleteAccount } = await import("@/server/actions/account");

    const res = await deleteAccount({ confirm: "DELETE" });

    expect(res.ok).toBe(true);
    // The sweep listed the session user's own folder…
    expect(h.listMock).toHaveBeenCalledWith(USER_ID);
    // …and removed every object in it, fully prefixed.
    expect(h.removeMock).toHaveBeenCalledTimes(1);
    expect(h.removeMock).toHaveBeenCalledWith([
      `${USER_ID}/cv.pdf`,
      `${USER_ID}/cv.docx`,
      `${USER_ID}/cv.txt`,
    ]);
    // Interleaving: ALL storage work strictly precedes ALL prisma writes.
    const firstDbWrite = h.order.findIndex(
      (e) => !e.startsWith("storage."),
    );
    const lastStorage = h.order
      .map((e, i) => (e.startsWith("storage.") ? i : -1))
      .reduce((a, b) => Math.max(a, b), -1);
    expect(lastStorage).toBeLessThan(firstDbWrite);
    expect(h.userDelete).toHaveBeenCalledTimes(1);
    expect(h.signOutMock).toHaveBeenCalledTimes(1);
  });

  it("stale DB pointer but EMPTY folder (file already gone) still deletes cleanly — the retry path is re-runnable", async () => {
    // cvStoragePath survives in the row, but the sweep's ground truth (the
    // bucket listing) is empty — e.g. the disclosed sweep-succeeded/tx-failed
    // inverse risk, on the user's second attempt.
    h.applyProfileFindUnique.mockResolvedValue({
      userId: USER_ID,
      cvStoragePath: `${USER_ID}/cv.pdf`,
    });
    h.listMock.mockResolvedValue({ data: [], error: null });
    const { deleteAccount } = await import("@/server/actions/account");

    const res = await deleteAccount({ confirm: "DELETE" });

    expect(res.ok).toBe(true);
    expect(h.removeMock).not.toHaveBeenCalled(); // nothing to remove
    expect(h.userDelete).toHaveBeenCalledTimes(1);
    expect(h.signOutMock).toHaveBeenCalledTimes(1);
  });
});

// ————————————————————————————————————————————————————————————————————————————
// exportMyData composed with the REAL downloadCv
// ————————————————————————————————————————————————————————————————————————————

describe("exportMyData through the real storage module", () => {
  const CV_ROW = {
    userId: USER_ID,
    cvStoragePath: `${USER_ID}/cv.pdf`,
    cvFileName: "My CV.pdf",
  };

  it("supabase download returning NEITHER data NOR error degrades to an explicit note (export intact)", async () => {
    h.applyProfileFindUnique.mockResolvedValue(CV_ROW);
    h.downloadMock.mockResolvedValue({ data: null, error: null });
    const { exportMyData } = await import("@/server/actions/account");

    const res = await exportMyData();

    expect(res.ok).toBe(true);
    expect(res.data).toBeTruthy();
    const cvFile = res.data!.cvFile;
    expect(cvFile).not.toBeNull();
    expect(cvFile!.available).toBe(false);
    if (cvFile!.available === false) {
      expect(cvFile!.note).toBeTruthy();
      expect(cvFile!.storagePath).toBe(`${USER_ID}/cv.pdf`);
    }
    // the rest of the export survived
    expect(res.data!.user).toBeTruthy();
    expect(res.data!.user!.passwordHash).toBeUndefined();
  });

  it("an EMPTY stored blob is still a faithful available:true export (0 bytes, empty base64)", async () => {
    h.applyProfileFindUnique.mockResolvedValue(CV_ROW);
    h.downloadMock.mockResolvedValue({
      data: new Blob([], { type: "application/pdf" }),
      error: null,
    });
    const { exportMyData } = await import("@/server/actions/account");

    const res = await exportMyData();

    expect(res.ok).toBe(true);
    const cvFile = res.data!.cvFile;
    expect(cvFile!.available).toBe(true);
    if (cvFile!.available) {
      expect(cvFile!.sizeBytes).toBe(0);
      expect(cvFile!.base64).toBe("");
      expect(cvFile!.encoding).toBe("base64");
    }
  });

  it("binary content survives the base64 round-trip byte-for-byte (all 256 byte values)", async () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    h.applyProfileFindUnique.mockResolvedValue(CV_ROW);
    h.downloadMock.mockResolvedValue({
      data: new Blob([bytes], { type: "application/pdf" }),
      error: null,
    });
    const { exportMyData } = await import("@/server/actions/account");

    const res = await exportMyData();

    const cvFile = res.data!.cvFile;
    expect(cvFile!.available).toBe(true);
    if (cvFile!.available) {
      expect(cvFile!.sizeBytes).toBe(256);
      const roundTripped = new Uint8Array(Buffer.from(cvFile!.base64, "base64"));
      expect(roundTripped).toEqual(bytes);
      // and the payload is JSON-serializable as promised
      expect(() => JSON.stringify(res.data)).not.toThrow();
    }
  });
});

// ————————————————————————————————————————————————————————————————————————————
// clearCvAction composed with the REAL removeCv
// ————————————————————————————————————————————————————————————————————————————

describe("clearCvAction through the real storage module", () => {
  it("storage env missing + CV on record: action FAILS and the DB pointer survives (retryable, never claims-gone)", async () => {
    configureStorageEnv(false);
    h.applyProfileFindUnique.mockResolvedValue({
      userId: USER_ID,
      cvStoragePath: `${USER_ID}/cv.pdf`,
    });
    const { clearCvAction } = await import("@/server/actions/applyProfile");

    const res = await clearCvAction();

    expect(res.ok).not.toBe(true);
    expect(res.error).toBeTruthy();
    // The pointer is the ONLY reference to the object — it must not be nulled.
    expect(h.applyProfileUpdate).not.toHaveBeenCalled();
  });

  it("supabase remove { error } (no throw): action FAILS and the DB pointer survives", async () => {
    h.applyProfileFindUnique.mockResolvedValue({
      userId: USER_ID,
      cvStoragePath: `${USER_ID}/cv.pdf`,
    });
    h.removeMock.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    const { clearCvAction } = await import("@/server/actions/applyProfile");

    const res = await clearCvAction();

    expect(res.ok).not.toBe(true);
    expect(res.error).toBeTruthy();
    expect(h.applyProfileUpdate).not.toHaveBeenCalled();
  });

  it("successful removal clears the metadata (happy path still works end-to-end)", async () => {
    h.applyProfileFindUnique.mockResolvedValue({
      userId: USER_ID,
      cvStoragePath: `${USER_ID}/cv.pdf`,
    });
    const { clearCvAction } = await import("@/server/actions/applyProfile");

    const res = await clearCvAction();

    expect(res.ok).toBe(true);
    expect(h.removeMock).toHaveBeenCalledWith([`${USER_ID}/cv.pdf`]);
    expect(h.applyProfileUpdate).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: {
        cvStoragePath: null,
        cvFileName: null,
        cvFileSize: null,
        cvText: null,
        cvUpdatedAt: null,
      },
    });
  });
});
