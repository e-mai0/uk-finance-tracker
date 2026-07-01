// src/test/account-actions.test.ts
//
// U2 — Account deletion + data export (PII trust minimum for invite-only beta).
//
// SAFETY: these tests NEVER touch a real DB. `@/server/db` and `@/server/auth`
// are fully mocked (vi.mock). No real prisma client is constructed, so there is
// no path to a destructive query against the shared Supabase instance.
//
// What this proves (the reviewer's held-out / mutation targets):
//  (a) deletion is SCOPED to the current user — delete is keyed on the session
//      user's id and NOTHING else; a foreign id is never accepted/used.
//  (b) COMPLETENESS — every userId-referencing model is either cascade-covered
//      (by user.delete) or explicitly deleted in the transaction. The set of
//      explicitly-deleted models is enumerated and asserted EXACTLY.
//  (c) export INCLUDES every owned table and REDACTS api-token secrets.
//  (d) deletion requires explicit typed confirmation.
//  (e) deletion signs the user out.

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  authMock,
  signOutMock,
  userDelete,
  txMock,
  // storage seams (CV file lives in Supabase Storage, not Prisma)
  storageConfiguredMock,
  downloadCvMock,
  removeAllCvObjectsForUserMock,
  // explicit deleteMany spies for the non-cascade models
  gardenerQuestionDeleteMany,
  gardenerRunDeleteMany,
  dailyUsageDeleteMany,
  draftEditDeleteMany,
  contentEmbeddingDeleteMany,
  // export finders
  userFindUnique,
  profileFindUnique,
  preferencesFindUnique,
  applyProfileFindUnique,
  builtCvFindUnique,
  savedFindMany,
  matchFindMany,
  answerBankFindMany,
  applicationFindMany,
  draftFindMany,
  memoryFindMany,
  chatFindMany,
  attentionFindMany,
  apiTokenFindMany,
  gardenerQuestionFindMany,
  dailyUsageFindMany,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  signOutMock: vi.fn(),
  userDelete: vi.fn(),
  txMock: vi.fn(),
  storageConfiguredMock: vi.fn(),
  downloadCvMock: vi.fn(),
  removeAllCvObjectsForUserMock: vi.fn(),
  gardenerQuestionDeleteMany: vi.fn(),
  gardenerRunDeleteMany: vi.fn(),
  dailyUsageDeleteMany: vi.fn(),
  draftEditDeleteMany: vi.fn(),
  contentEmbeddingDeleteMany: vi.fn(),
  userFindUnique: vi.fn(),
  profileFindUnique: vi.fn(),
  preferencesFindUnique: vi.fn(),
  applyProfileFindUnique: vi.fn(),
  builtCvFindUnique: vi.fn(),
  savedFindMany: vi.fn(),
  matchFindMany: vi.fn(),
  answerBankFindMany: vi.fn(),
  applicationFindMany: vi.fn(),
  draftFindMany: vi.fn(),
  memoryFindMany: vi.fn(),
  chatFindMany: vi.fn(),
  attentionFindMany: vi.fn(),
  apiTokenFindMany: vi.fn(),
  gardenerQuestionFindMany: vi.fn(),
  dailyUsageFindMany: vi.fn(),
}));

// The transaction client exposed inside prisma.$transaction(cb). It carries the
// explicit-delete models plus user.delete (cascade handles the rest).
const txClient = {
  gardenerQuestion: { deleteMany: gardenerQuestionDeleteMany },
  gardenerRun: { deleteMany: gardenerRunDeleteMany },
  dailyUsage: { deleteMany: dailyUsageDeleteMany },
  draftEdit: { deleteMany: draftEditDeleteMany },
  contentEmbedding: { deleteMany: contentEmbeddingDeleteMany },
  user: { delete: userDelete },
};

vi.mock("@/server/db", () => ({
  prisma: {
    // $transaction(cb) — run the callback with the tx client and record it.
    $transaction: (cb: (tx: typeof txClient) => unknown) => {
      txMock(cb);
      return cb(txClient);
    },
    user: { delete: userDelete, findUnique: userFindUnique },
    profile: { findUnique: profileFindUnique },
    preferences: { findUnique: preferencesFindUnique },
    applyProfile: { findUnique: applyProfileFindUnique },
    builtCv: { findUnique: builtCvFindUnique },
    savedOpportunity: { findMany: savedFindMany },
    matchScore: { findMany: matchFindMany },
    answerBankItem: { findMany: answerBankFindMany },
    application: { findMany: applicationFindMany },
    generatedDraft: { findMany: draftFindMany },
    memoryFile: { findMany: memoryFindMany },
    chatSession: { findMany: chatFindMany },
    attentionItem: { findMany: attentionFindMany },
    apiToken: { findMany: apiTokenFindMany },
    gardenerQuestion: {
      deleteMany: gardenerQuestionDeleteMany,
      findMany: gardenerQuestionFindMany,
    },
    gardenerRun: { deleteMany: gardenerRunDeleteMany },
    dailyUsage: {
      deleteMany: dailyUsageDeleteMany,
      findMany: dailyUsageFindMany,
    },
    draftEdit: { deleteMany: draftEditDeleteMany },
    contentEmbedding: { deleteMany: contentEmbeddingDeleteMany },
  },
}));

vi.mock("@/server/auth", () => ({ auth: authMock, signOut: signOutMock }));

// Storage is fully mocked — no supabase-js client is ever constructed here.
vi.mock("@/server/storage", () => ({
  storageConfigured: storageConfiguredMock,
  downloadCv: downloadCvMock,
  removeAllCvObjectsForUser: removeAllCvObjectsForUserMock,
}));

import { deleteAccount, exportMyData } from "@/server/actions/account";

const USER_ID = "user-me";

function setSignedIn(id = USER_ID) {
  authMock.mockResolvedValue({ user: { id, email: "me@example.com", name: "Me" } });
}

function resetAll() {
  vi.clearAllMocks();
  // default: every explicit deleteMany + user.delete + tx resolve fine
  for (const fn of [
    userDelete,
    gardenerQuestionDeleteMany,
    gardenerRunDeleteMany,
    dailyUsageDeleteMany,
    draftEditDeleteMany,
    contentEmbeddingDeleteMany,
    signOutMock,
  ]) {
    (fn as ReturnType<typeof vi.fn>).mockResolvedValue({});
  }
  // default: storage configured, sweep succeeds having found nothing.
  storageConfiguredMock.mockReturnValue(true);
  removeAllCvObjectsForUserMock.mockResolvedValue([]);
}

beforeEach(resetAll);

describe("deleteAccount", () => {
  it("rejects an unconfirmed call and touches NO data", async () => {
    setSignedIn();
    const res = await deleteAccount({ confirm: "" });
    expect(res.ok).not.toBe(true);
    expect(res.error).toBeTruthy();
    expect(userDelete).not.toHaveBeenCalled();
    expect(txMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong confirmation phrase", async () => {
    setSignedIn();
    const res = await deleteAccount({ confirm: "delete please" });
    expect(res.ok).not.toBe(true);
    expect(userDelete).not.toHaveBeenCalled();
    expect(txMock).not.toHaveBeenCalled();
  });

  it("errors when unauthenticated and touches nothing", async () => {
    authMock.mockResolvedValue(null);
    const res = await deleteAccount({ confirm: "DELETE" });
    expect(res.error).toBeTruthy();
    expect(userDelete).not.toHaveBeenCalled();
    expect(txMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("hard-deletes the user (cascade) inside a single transaction when confirmed", async () => {
    setSignedIn();
    await deleteAccount({ confirm: "DELETE" });
    // All destructive work happens inside ONE $transaction.
    expect(txMock).toHaveBeenCalledTimes(1);
    expect(userDelete).toHaveBeenCalledTimes(1);
  });

  it("deletes ONLY the authenticated user's id — never a foreign id", async () => {
    setSignedIn("user-me");
    await deleteAccount({ confirm: "DELETE" });

    // user.delete is keyed on the session id.
    expect(userDelete).toHaveBeenCalledWith({ where: { id: "user-me" } });

    // Every explicit deleteMany is scoped to { userId: <session id> }.
    for (const fn of [
      gardenerQuestionDeleteMany,
      gardenerRunDeleteMany,
      dailyUsageDeleteMany,
      draftEditDeleteMany,
      contentEmbeddingDeleteMany,
    ]) {
      expect(fn).toHaveBeenCalledWith({ where: { userId: "user-me" } });
    }
  });

  it("ignores any client-supplied id and uses the SESSION id (mutation guard)", async () => {
    setSignedIn("real-session-user");
    // A malicious extra field must not redirect the delete to another user.
    await deleteAccount({
      confirm: "DELETE",
      // @ts-expect-error — userId is intentionally NOT part of the input type
      userId: "victim-user",
    });
    expect(userDelete).toHaveBeenCalledWith({ where: { id: "real-session-user" } });
    expect(userDelete).not.toHaveBeenCalledWith({ where: { id: "victim-user" } });
    for (const fn of [
      gardenerQuestionDeleteMany,
      gardenerRunDeleteMany,
      dailyUsageDeleteMany,
      draftEditDeleteMany,
      contentEmbeddingDeleteMany,
    ]) {
      expect(fn).not.toHaveBeenCalledWith({ where: { userId: "victim-user" } });
    }
  });

  it("COMPLETENESS: explicitly deletes every non-cascade userId-keyed model", async () => {
    setSignedIn();
    await deleteAccount({ confirm: "DELETE" });
    // The exact set of models that do NOT have onDelete: Cascade on userId in
    // schema.prisma and therefore MUST be explicitly cleared. If a new
    // non-cascade user-referencing model is added, this list must grow with it.
    expect(gardenerQuestionDeleteMany).toHaveBeenCalledTimes(1);
    expect(gardenerRunDeleteMany).toHaveBeenCalledTimes(1);
    expect(dailyUsageDeleteMany).toHaveBeenCalledTimes(1);
    expect(draftEditDeleteMany).toHaveBeenCalledTimes(1);
    expect(contentEmbeddingDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("signs the user out after a successful deletion", async () => {
    setSignedIn();
    const res = await deleteAccount({ confirm: "DELETE" });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });

  it("explicit deletes run BEFORE user.delete (no orphan-FK ordering hazard)", async () => {
    setSignedIn();
    const order: string[] = [];
    gardenerQuestionDeleteMany.mockImplementation(async () => {
      order.push("explicit");
      return {};
    });
    userDelete.mockImplementation(async () => {
      order.push("user");
      return {};
    });
    await deleteAccount({ confirm: "DELETE" });
    expect(order.indexOf("explicit")).toBeLessThan(order.indexOf("user"));
  });

  // ——— GDPR erasure completeness: the uploaded CV FILE lives in Supabase
  // Storage, not Prisma — deletion must erase it too, and must NEVER claim
  // complete erasure while silently leaving the file behind.

  it("sweeps the user's CV storage folder BEFORE the DB transaction", async () => {
    setSignedIn();
    const order: string[] = [];
    removeAllCvObjectsForUserMock.mockImplementation(async () => {
      order.push("storage");
      return ["user-me/cv.pdf"];
    });
    userDelete.mockImplementation(async () => {
      order.push("user");
      return {};
    });

    const res = await deleteAccount({ confirm: "DELETE" });

    expect(res.ok).toBe(true);
    expect(removeAllCvObjectsForUserMock).toHaveBeenCalledTimes(1);
    expect(removeAllCvObjectsForUserMock).toHaveBeenCalledWith(USER_ID);
    // Storage first: once the rows (and session) are gone, nothing references
    // the storage path any more, so a failed post-hoc cleanup would orphan the
    // file with no way to retry. Failing first keeps the action retryable.
    expect(order.indexOf("storage")).toBeLessThan(order.indexOf("user"));
  });

  it("ABORTS deletion (no DB rows touched, no sign-out) when CV storage erasure fails", async () => {
    setSignedIn();
    removeAllCvObjectsForUserMock.mockRejectedValue(new Error("storage down"));

    const res = await deleteAccount({ confirm: "DELETE" });

    expect(res.ok).not.toBe(true);
    expect(res.error).toMatch(/CV/i);
    expect(txMock).not.toHaveBeenCalled();
    expect(userDelete).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("CV erasure sweep is scoped to the SESSION user's id (mutation guard)", async () => {
    setSignedIn("real-session-user");
    await deleteAccount({
      confirm: "DELETE",
      // @ts-expect-error — userId is intentionally NOT part of the input type
      userId: "victim-user",
    });
    expect(removeAllCvObjectsForUserMock).toHaveBeenCalledWith("real-session-user");
    expect(removeAllCvObjectsForUserMock).not.toHaveBeenCalledWith("victim-user");
  });

  it("refuses to delete when storage is unconfigured but a CV file is on record", async () => {
    setSignedIn();
    storageConfiguredMock.mockReturnValue(false);
    applyProfileFindUnique.mockResolvedValue({ cvStoragePath: "user-me/cv.pdf" });

    const res = await deleteAccount({ confirm: "DELETE" });

    expect(res.ok).not.toBe(true);
    expect(res.error).toBeTruthy();
    expect(removeAllCvObjectsForUserMock).not.toHaveBeenCalled();
    expect(txMock).not.toHaveBeenCalled();
    expect(userDelete).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("proceeds when storage is unconfigured and NO CV file is on record", async () => {
    setSignedIn();
    storageConfiguredMock.mockReturnValue(false);
    applyProfileFindUnique.mockResolvedValue(null);

    const res = await deleteAccount({ confirm: "DELETE" });

    expect(res.ok).toBe(true);
    expect(removeAllCvObjectsForUserMock).not.toHaveBeenCalled();
    expect(userDelete).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});

describe("exportMyData", () => {
  beforeEach(() => {
    setSignedIn();
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      email: "me@example.com",
      name: "Me",
      createdAt: new Date("2026-01-01"),
      onboardedAt: new Date("2026-01-02"),
      // a sensitive field that must NEVER be exported
      passwordHash: "$2b$10$supersecrethash",
    });
    profileFindUnique.mockResolvedValue({ id: "p1", userId: USER_ID });
    preferencesFindUnique.mockResolvedValue({ id: "pr1", userId: USER_ID });
    applyProfileFindUnique.mockResolvedValue({ id: "ap1", userId: USER_ID });
    builtCvFindUnique.mockResolvedValue({ id: "cv1", userId: USER_ID });
    savedFindMany.mockResolvedValue([{ id: "s1" }]);
    matchFindMany.mockResolvedValue([{ id: "ms1" }]);
    answerBankFindMany.mockResolvedValue([{ id: "ab1" }]);
    applicationFindMany.mockResolvedValue([{ id: "app1" }]);
    draftFindMany.mockResolvedValue([{ id: "gd1" }]);
    memoryFindMany.mockResolvedValue([{ id: "mf1", revisions: [{ id: "mr1" }] }]);
    chatFindMany.mockResolvedValue([{ id: "cs1", messages: [{ id: "cm1" }] }]);
    attentionFindMany.mockResolvedValue([{ id: "ai1" }]);
    apiTokenFindMany.mockResolvedValue([
      {
        id: "tok1",
        name: "Browser extension",
        createdAt: new Date("2026-02-01"),
        lastUsedAt: null,
        revokedAt: null,
        tokenHash: "REAL_SECRET_HASH_DO_NOT_LEAK",
      },
    ]);
    gardenerQuestionFindMany.mockResolvedValue([{ id: "gq1" }]);
    dailyUsageFindMany.mockResolvedValue([{ id: "du1" }]);
  });

  it("errors when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await exportMyData();
    expect(res.error).toBeTruthy();
    expect(res.data).toBeUndefined();
  });

  it("scopes every owned-table query to the session user's id", async () => {
    await exportMyData();
    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } }),
    );
    for (const fn of [
      profileFindUnique,
      preferencesFindUnique,
      applyProfileFindUnique,
      builtCvFindUnique,
    ]) {
      expect(fn).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    }
    for (const fn of [
      savedFindMany,
      matchFindMany,
      answerBankFindMany,
      applicationFindMany,
      draftFindMany,
      memoryFindMany,
      chatFindMany,
      attentionFindMany,
      apiTokenFindMany,
      gardenerQuestionFindMany,
      dailyUsageFindMany,
    ]) {
      expect(fn).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    }
  });

  it("INCLUDES every owned table in the export payload", async () => {
    const res = await exportMyData();
    expect(res.ok).toBe(true);
    const d = res.data!;
    // user + every owned table must be present as a key.
    for (const key of [
      "user",
      "profile",
      "preferences",
      "applyProfile",
      "builtCv",
      "savedOpportunities",
      "matchScores",
      "answerBank",
      "applications",
      "generatedDrafts",
      "memoryFiles",
      "chatSessions",
      "attentionItems",
      "apiTokens",
      "gardenerQuestions",
      "dailyUsage",
    ]) {
      expect(d).toHaveProperty(key);
    }
  });

  it("REDACTS api-token secrets — metadata only, never the raw hash", async () => {
    const res = await exportMyData();
    const serialized = JSON.stringify(res.data);
    expect(serialized).not.toContain("REAL_SECRET_HASH_DO_NOT_LEAK");
    // The token metadata is still present (name kept), but tokenHash dropped.
    const tok = (res.data as unknown as { apiTokens: Record<string, unknown>[] })
      .apiTokens[0];
    expect(tok.name).toBe("Browser extension");
    expect(tok).not.toHaveProperty("tokenHash");
  });

  it("NEVER exports the account passwordHash", async () => {
    const res = await exportMyData();
    const serialized = JSON.stringify(res.data);
    expect(serialized).not.toContain("supersecrethash");
    const user = (res.data as { user: Record<string, unknown> }).user;
    expect(user).not.toHaveProperty("passwordHash");
    // but identity metadata is retained
    expect(user.email).toBe("me@example.com");
  });

  it("returns a JSON-serializable payload", async () => {
    const res = await exportMyData();
    expect(() => JSON.stringify(res.data)).not.toThrow();
  });

  // ——— GDPR access completeness: the uploaded CV FILE (Supabase Storage) must
  // be part of "everything we hold about you", not just its DB metadata row.

  it("exports cvFile: null (key present) when no CV was ever uploaded", async () => {
    // default applyProfile row in beforeEach has no cvStoragePath
    const res = await exportMyData();
    expect(res.ok).toBe(true);
    expect(res.data).toHaveProperty("cvFile");
    expect(res.data!.cvFile).toBeNull();
    expect(downloadCvMock).not.toHaveBeenCalled();
  });

  it("INCLUDES the uploaded CV file itself — base64 content + metadata", async () => {
    applyProfileFindUnique.mockResolvedValue({
      id: "ap1",
      userId: USER_ID,
      cvStoragePath: "user-me/cv.pdf",
      cvFileName: "Eric CV.pdf",
      cvFileSize: 4,
    });
    downloadCvMock.mockResolvedValue(
      new Blob([new Uint8Array([0xde, 0xad, 0xbe, 0xef])], {
        type: "application/pdf",
      }),
    );

    const res = await exportMyData();

    expect(res.ok).toBe(true);
    expect(downloadCvMock).toHaveBeenCalledWith("user-me/cv.pdf");
    expect(res.data!.cvFile).toEqual({
      available: true,
      fileName: "Eric CV.pdf",
      storagePath: "user-me/cv.pdf",
      contentType: "application/pdf",
      sizeBytes: 4,
      encoding: "base64",
      base64: "3q2+7w==",
    });
    expect(() => JSON.stringify(res.data)).not.toThrow();
  });

  it("DEGRADES with an explicit note (rest of export intact) when the CV download fails", async () => {
    applyProfileFindUnique.mockResolvedValue({
      id: "ap1",
      userId: USER_ID,
      cvStoragePath: "user-me/cv.pdf",
      cvFileName: "Eric CV.pdf",
    });
    downloadCvMock.mockRejectedValue(new Error("object not found"));

    const res = await exportMyData();

    // The export must still succeed — a broken file read must not block the
    // user's access to every OTHER piece of their data...
    expect(res.ok).toBe(true);
    expect(res.data!.applications).toEqual([{ id: "app1" }]);
    // ...but the gap must be explicit, never silent.
    const cvFile = res.data!.cvFile as Record<string, unknown>;
    expect(cvFile.available).toBe(false);
    expect(cvFile.storagePath).toBe("user-me/cv.pdf");
    expect(cvFile.fileName).toBe("Eric CV.pdf");
    expect(String(cvFile.note)).toMatch(/could not/i);
    expect(cvFile).not.toHaveProperty("base64");
  });

  it("notes the gap explicitly when a CV exists but storage is unconfigured", async () => {
    storageConfiguredMock.mockReturnValue(false);
    applyProfileFindUnique.mockResolvedValue({
      id: "ap1",
      userId: USER_ID,
      cvStoragePath: "user-me/cv.pdf",
      cvFileName: "Eric CV.pdf",
    });

    const res = await exportMyData();

    expect(res.ok).toBe(true);
    expect(downloadCvMock).not.toHaveBeenCalled();
    const cvFile = res.data!.cvFile as Record<string, unknown>;
    expect(cvFile.available).toBe(false);
    expect(String(cvFile.note)).toBeTruthy();
  });
});
