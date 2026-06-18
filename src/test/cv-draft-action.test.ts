// src/test/cv-draft-action.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { auth } from "@/server/auth";

vi.mock("server-only", () => ({}));

const { gather, draft, persist, ensureSession, seedCoach } = vi.hoisted(() => ({
  gather: vi.fn(),
  draft: vi.fn(),
  persist: vi.fn(),
  ensureSession: vi.fn(),
  seedCoach: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/server/cv/grounding", () => ({ syncCvGrounding: vi.fn() }));
vi.mock("@/server/cv/known-profile", () => ({ gatherKnownProfile: gather }));
vi.mock("@/server/cv/generate", () => ({ draftCvDataFromKnown: draft }));
vi.mock("@/server/cv/store", () => ({ persistCv: persist, ensureCvChatSession: ensureSession }));
vi.mock("@/server/cv/coach", () => ({ seedCoachOpening: seedCoach }));

import { draftCvFromKnown } from "@/server/actions/cv";
import { cvDataSchema } from "@/lib/cv";

beforeEach(() => {
  vi.clearAllMocks();
  gather.mockResolvedValue({ fullName: "Eric Mai", memoryFacts: [] });
  const cv = cvDataSchema.parse({ fullName: "Eric Mai", education: [{ institution: "Cambridge", qualification: "Economics BA" }] });
  draft.mockResolvedValue(cv);
  persist.mockResolvedValue(cv);
  ensureSession.mockResolvedValue("sess-1");
  seedCoach.mockResolvedValue({ seeded: true, clientId: "coach-opening:sess-1" });
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

  it("seeds the CV coach opening for the user's CV chat session after drafting", async () => {
    const res = await draftCvFromKnown();
    expect(res.ok).toBe(true);
    expect(ensureSession).toHaveBeenCalledWith("u1");
    expect(seedCoach).toHaveBeenCalledOnce();
    const arg = seedCoach.mock.calls[0][0];
    expect(arg.userId).toBe("u1");
    expect(arg.sessionId).toBe("sess-1");
    // The coach must receive the persisted CV (so its assessment is grounded).
    expect(arg.cv.fullName).toBe("Eric Mai");
  });

  it("returns an error when not signed in", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await draftCvFromKnown();
    expect(res.error).toMatch(/session/i);
    expect(gather).not.toHaveBeenCalled();
  });
});
