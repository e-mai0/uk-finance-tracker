// src/test/cv-draft-action.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { auth } from "@/server/auth";

vi.mock("server-only", () => ({}));

const { gather, draft, persist } = vi.hoisted(() => ({
  gather: vi.fn(),
  draft: vi.fn(),
  persist: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/server/cv/grounding", () => ({ syncCvGrounding: vi.fn() }));
vi.mock("@/server/cv/known-profile", () => ({ gatherKnownProfile: gather }));
vi.mock("@/server/cv/generate", () => ({ draftCvDataFromKnown: draft }));
vi.mock("@/server/cv/store", () => ({ persistCv: persist }));

import { draftCvFromKnown } from "@/server/actions/cv";
import { cvDataSchema } from "@/lib/cv";

beforeEach(() => {
  vi.clearAllMocks();
  gather.mockResolvedValue({ fullName: "Eric Mai", memoryFacts: [] });
  const cv = cvDataSchema.parse({ fullName: "Eric Mai", education: [{ institution: "Cambridge", qualification: "Economics BA" }] });
  draft.mockResolvedValue(cv);
  persist.mockResolvedValue(cv);
});

describe("draftCvFromKnown", () => {
  it("gathers, drafts, persists and returns the CV", async () => {
    const res = await draftCvFromKnown();
    expect(res.ok).toBe(true);
    expect(res.cv?.fullName).toBe("Eric Mai");
    expect(gather).toHaveBeenCalledWith("u1");
    expect(draft).toHaveBeenCalledWith("u1", { fullName: "Eric Mai", memoryFacts: [] });
    expect(persist).toHaveBeenCalledOnce();
  });

  it("does not persist a fallback when uploaded CV text could not be drafted", async () => {
    gather.mockResolvedValueOnce({
      fullName: "Eric Mai",
      uploadedCvText: "Eric Mai\nSpring week at Deloitte\nPython trading project",
      memoryFacts: [],
    });
    draft.mockResolvedValueOnce(null);

    const res = await draftCvFromKnown();

    expect(res.error).toMatch(/uploaded CV is still saved/i);
    expect(persist).not.toHaveBeenCalled();
  });

  it("does not persist an empty draft", async () => {
    draft.mockResolvedValueOnce(cvDataSchema.parse({ fullName: "Eric Mai" }));

    const res = await draftCvFromKnown();

    expect(res.ok).toBe(true);
    expect(res.cv).toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
  });

  it("returns an error when not signed in", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await draftCvFromKnown();
    expect(res.error).toMatch(/session/i);
    expect(gather).not.toHaveBeenCalled();
  });
});
