import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  draftFindFirst,
  draftEditCreate,
  authMock,
  revalidateMock,
  saveAnswerMock,
  resolveByKeyMock,
  maybeDistillMock,
  afterMock,
} = vi.hoisted(() => ({
  draftFindFirst: vi.fn(),
  draftEditCreate: vi.fn(),
  authMock: vi.fn(),
  revalidateMock: vi.fn(),
  saveAnswerMock: vi.fn(),
  resolveByKeyMock: vi.fn(),
  maybeDistillMock: vi.fn(),
  afterMock: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    generatedDraft: { findFirst: draftFindFirst },
    draftEdit: { create: draftEditCreate },
  },
}));
vi.mock("@/server/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("@/server/answers", () => ({ saveAnswerToBank: saveAnswerMock }));
vi.mock("@/server/attention", () => ({ resolveAttentionByKey: resolveByKeyMock }));
vi.mock("@/server/engine/distill", () => ({ maybeDistill: maybeDistillMock }));

import { acceptDraft, skipDraft } from "@/server/actions/drafts";

const DRAFT = {
  id: "d1",
  userId: "u1",
  kind: "ANSWER",
  content: "Original draft answer.",
  context: { question: "Why this firm?", employer: "Citadel" },
};

beforeEach(() => {
  draftFindFirst.mockReset();
  draftEditCreate.mockReset();
  authMock.mockReset();
  revalidateMock.mockReset();
  saveAnswerMock.mockReset();
  resolveByKeyMock.mockReset();
  maybeDistillMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u1" } });
  draftFindFirst.mockResolvedValue(DRAFT);
  saveAnswerMock.mockResolvedValue({ id: "b1" });
  resolveByKeyMock.mockResolvedValue(undefined);
  draftEditCreate.mockResolvedValue({});
});

describe("acceptDraft", () => {
  it("saves the unedited draft to the answer bank and resolves the attention item", async () => {
    const res = await acceptDraft("d1");

    expect(draftFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1", userId: "u1" } }),
    );
    expect(saveAnswerMock).toHaveBeenCalledWith({
      userId: "u1",
      questionText: "Why this firm?",
      answer: "Original draft answer.",
      employer: "Citadel",
    });
    expect(draftEditCreate).not.toHaveBeenCalled();
    expect(maybeDistillMock).not.toHaveBeenCalled();
    expect(resolveByKeyMock).toHaveBeenCalledWith("u1", "draft:d1");
    expect(revalidateMock).toHaveBeenCalledWith("/today");
    expect(res).toEqual({ ok: true });
  });

  it("saves edited content and records a DraftEdit + distill pass", async () => {
    const res = await acceptDraft("d1", "My edited answer.");

    expect(saveAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({ answer: "My edited answer." }),
    );
    expect(draftEditCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        draftId: "d1",
        original: "Original draft answer.",
        edited: "My edited answer.",
      },
    });
    expect(maybeDistillMock).toHaveBeenCalledWith("u1");
    expect(res).toEqual({ ok: true });
  });

  it("treats blank edited content as accepting the original (no DraftEdit)", async () => {
    await acceptDraft("d1", "   ");

    expect(saveAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({ answer: "Original draft answer." }),
    );
    expect(draftEditCreate).not.toHaveBeenCalled();
  });

  it("falls back to '(untitled answer)' when context has no question", async () => {
    draftFindFirst.mockResolvedValue({ ...DRAFT, context: null });

    await acceptDraft("d1");

    expect(saveAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({ questionText: "(untitled answer)" }),
    );
  });

  it("errors on a foreign or missing draft without writing", async () => {
    draftFindFirst.mockResolvedValue(null);

    const res = await acceptDraft("not-mine");

    expect(res).toEqual({ error: "Not found." });
    expect(saveAnswerMock).not.toHaveBeenCalled();
    expect(resolveByKeyMock).not.toHaveBeenCalled();
  });

  it("errors when unauthenticated and touches no data", async () => {
    authMock.mockResolvedValue(null);

    const res = await acceptDraft("d1");

    expect(res).toEqual({ error: "Your session has expired. Sign in again." });
    expect(draftFindFirst).not.toHaveBeenCalled();
  });
});

describe("skipDraft", () => {
  it("resolves the attention item only — no bank write", async () => {
    const res = await skipDraft("d1");

    expect(draftFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1", userId: "u1" } }),
    );
    expect(resolveByKeyMock).toHaveBeenCalledWith("u1", "draft:d1");
    expect(saveAnswerMock).not.toHaveBeenCalled();
    expect(draftEditCreate).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true });
  });

  it("errors on a foreign or missing draft without resolving", async () => {
    draftFindFirst.mockResolvedValue(null);

    const res = await skipDraft("not-mine");

    expect(res).toEqual({ error: "Not found." });
    expect(resolveByKeyMock).not.toHaveBeenCalled();
  });

  it("errors when unauthenticated and touches no data", async () => {
    authMock.mockResolvedValue(null);

    const res = await skipDraft("d1");

    expect(res).toEqual({ error: "Your session has expired. Sign in again." });
    expect(draftFindFirst).not.toHaveBeenCalled();
  });
});
