import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createClientMock, fromMock, removeMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  fromMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

describe("removeCv", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    fromMock.mockReturnValue({ remove: removeMock });
    createClientMock.mockReturnValue({ storage: { from: fromMock } });
    removeMock.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("removes the requested CV object from the private bucket", async () => {
    const { CV_BUCKET, removeCv } = await import("@/server/storage");

    await removeCv("u1/cv.pdf");

    expect(fromMock).toHaveBeenCalledWith(CV_BUCKET);
    expect(removeMock).toHaveBeenCalledWith(["u1/cv.pdf"]);
  });

  it("throws when Supabase reports a removal error", async () => {
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
