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
  removeCv,
  userDelete,
  txMock,
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
  removeCv: vi.fn(),
  userDelete: vi.fn(),
  txMock: vi.fn(),
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
vi.mock("@/server/storage", () => ({ removeCv }));

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
    removeCv,
  ]) {
    (fn as ReturnType<typeof vi.fn>).mockResolvedValue({});
  }
  applyProfileFindUnique.mockResolvedValue(null);
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

  it("removes the uploaded CV object before deleting the account", async () => {
    setSignedIn();
    const order: string[] = [];
    applyProfileFindUnique.mockResolvedValue({
      id: "ap1",
      userId: USER_ID,
      cvStoragePath: `${USER_ID}/cv.pdf`,
    });
    removeCv.mockImplementation(async () => {
      order.push("storage");
    });
    userDelete.mockImplementation(async () => {
      order.push("user");
      return {};
    });

    const res = await deleteAccount({ confirm: "DELETE" });

    expect(res.ok).toBe(true);
    expect(applyProfileFindUnique).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      select: { cvStoragePath: true },
    });
    expect(removeCv).toHaveBeenCalledWith(`${USER_ID}/cv.pdf`);
    expect(order.indexOf("storage")).toBeLessThan(order.indexOf("user"));
  });

  it("does not delete the account when CV storage removal fails", async () => {
    setSignedIn();
    applyProfileFindUnique.mockResolvedValue({
      id: "ap1",
      userId: USER_ID,
      cvStoragePath: `${USER_ID}/cv.pdf`,
    });
    removeCv.mockRejectedValue(new Error("storage down"));

    await expect(deleteAccount({ confirm: "DELETE" })).rejects.toThrow("storage down");

    expect(txMock).not.toHaveBeenCalled();
    expect(userDelete).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
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
});
