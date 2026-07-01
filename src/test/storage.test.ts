// src/test/storage.test.ts
//
// CV storage primitives (src/server/storage.ts) against a mocked supabase-js
// client — no live Supabase is ever touched.
//
// What this pins (GDPR-completeness unit):
//  (a) removeCv FAILS CLOSED: supabase-js reports failures via the returned
//      `{ error }` (it does not throw), so silently discarding it means a
//      "removed" CV can still exist. removeCv must throw on a reported error.
//  (b) downloadCv (account export) returns the stored blob and throws on error.
//  (c) removeAllCvObjectsForUser (account deletion sweep) lists the user's own
//      folder and removes EXACTLY the objects found there — every removed path
//      is scoped under `${userId}/`, an empty folder removes nothing, and both
//      list and remove errors throw (deletion must never claim erasure it
//      cannot prove).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createClientMock, fromMock, removeMock, downloadMock, listMock } =
  vi.hoisted(() => ({
    createClientMock: vi.fn(),
    fromMock: vi.fn(),
    removeMock: vi.fn(),
    downloadMock: vi.fn(),
    listMock: vi.fn(),
  }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  fromMock.mockReturnValue({
    remove: removeMock,
    download: downloadMock,
    list: listMock,
  });
  createClientMock.mockReturnValue({ storage: { from: fromMock } });
  removeMock.mockResolvedValue({ data: [], error: null });
  downloadMock.mockResolvedValue({ data: null, error: null });
  listMock.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("removeCv", () => {
  it("removes the requested CV object from the private bucket", async () => {
    const { CV_BUCKET, removeCv } = await import("@/server/storage");

    await removeCv("u1/cv.pdf");

    expect(fromMock).toHaveBeenCalledWith(CV_BUCKET);
    expect(removeMock).toHaveBeenCalledWith(["u1/cv.pdf"]);
  });

  it("throws when Supabase reports a removal error (fail closed, not silent)", async () => {
    removeMock.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    const { removeCv } = await import("@/server/storage");

    await expect(removeCv("u1/cv.pdf")).rejects.toThrow(
      "CV removal failed: permission denied",
    );
  });
});

describe("downloadCv", () => {
  it("downloads the stored object from the private bucket", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: "application/pdf",
    });
    downloadMock.mockResolvedValue({ data: blob, error: null });
    const { CV_BUCKET, downloadCv } = await import("@/server/storage");

    const res = await downloadCv("u1/cv.pdf");

    expect(fromMock).toHaveBeenCalledWith(CV_BUCKET);
    expect(downloadMock).toHaveBeenCalledWith("u1/cv.pdf");
    expect(res).toBe(blob);
  });

  it("throws when Supabase reports a download error or returns no data", async () => {
    downloadMock.mockResolvedValue({
      data: null,
      error: { message: "object not found" },
    });
    const { downloadCv } = await import("@/server/storage");

    await expect(downloadCv("u1/cv.pdf")).rejects.toThrow(
      "CV download failed: object not found",
    );
  });
});

describe("removeAllCvObjectsForUser", () => {
  it("lists the user's own folder and removes every object found there", async () => {
    listMock.mockResolvedValue({
      data: [{ name: "cv.pdf" }, { name: "cv.docx" }],
      error: null,
    });
    const { removeAllCvObjectsForUser } = await import("@/server/storage");

    const removed = await removeAllCvObjectsForUser("u1");

    expect(listMock).toHaveBeenCalledWith("u1");
    expect(removeMock).toHaveBeenCalledWith(["u1/cv.pdf", "u1/cv.docx"]);
    expect(removed).toEqual(["u1/cv.pdf", "u1/cv.docx"]);
  });

  it("SCOPING: every removed path sits under the given user's prefix", async () => {
    listMock.mockResolvedValue({
      data: [{ name: "cv.pdf" }, { name: "old-cv.docx" }],
      error: null,
    });
    const { removeAllCvObjectsForUser } = await import("@/server/storage");

    await removeAllCvObjectsForUser("user-me");

    const paths = removeMock.mock.calls[0][0] as string[];
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p.startsWith("user-me/")).toBe(true);
    }
  });

  it("removes nothing (and calls remove not at all) when the folder is empty", async () => {
    listMock.mockResolvedValue({ data: [], error: null });
    const { removeAllCvObjectsForUser } = await import("@/server/storage");

    const removed = await removeAllCvObjectsForUser("u1");

    expect(removed).toEqual([]);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("throws when the folder listing fails (never claim erasure it cannot prove)", async () => {
    listMock.mockResolvedValue({
      data: null,
      error: { message: "list blew up" },
    });
    const { removeAllCvObjectsForUser } = await import("@/server/storage");

    await expect(removeAllCvObjectsForUser("u1")).rejects.toThrow(
      "CV storage list failed: list blew up",
    );
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("throws when the bulk removal fails", async () => {
    listMock.mockResolvedValue({ data: [{ name: "cv.pdf" }], error: null });
    removeMock.mockResolvedValue({
      data: null,
      error: { message: "remove blew up" },
    });
    const { removeAllCvObjectsForUser } = await import("@/server/storage");

    await expect(removeAllCvObjectsForUser("u1")).rejects.toThrow(
      "CV removal failed: remove blew up",
    );
  });
});
