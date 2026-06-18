import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  findUnique: vi.fn(),
  findUniqueEmployer: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => Object.assign(() => ({}), {
    tools: { webSearch_20250305: () => ({}) },
  }),
  anthropic: { tools: { webSearch_20250305: () => ({}) } },
}));
vi.mock("@/server/ai/budget", () => ({ recordUsage: vi.fn(async () => {}) }));
vi.mock("@/server/db", () => ({
  prisma: {
    employerResearch: {
      findUnique: (...a: unknown[]) => mocks.findUnique(...a),
      upsert: (...a: unknown[]) => mocks.upsert(...a),
    },
    employer: {
      findUnique: (...a: unknown[]) => mocks.findUniqueEmployer(...a),
    },
  },
}));

import { ensureEmployerResearch } from "@/server/engine/research";

describe("ensureEmployerResearch — upgraded prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null); // no cache → generate
    mocks.findUniqueEmployer.mockResolvedValue({ id: "e1", name: "Barclays", sector: "Banking" });
    mocks.generateText.mockResolvedValue({ text: "## Divisions\n...", usage: { totalTokens: 50 } });
    mocks.upsert.mockImplementation(async ({ create, update }: { create?: { content: string }; update?: { content: string } }) => ({
      content: (create ?? update)!.content,
    }));
  });

  it("requests a concrete recent hook the applicant can cite", async () => {
    await ensureEmployerResearch("e1");
    const prompt = mocks.generateText.mock.calls[0][0].prompt as string;
    expect(prompt.toLowerCase()).toMatch(/hook|deal|fund|initiative|transaction/);
    expect(prompt.toLowerCase()).toMatch(/recent|last 6 months|six months/);
  });

  it("requests the firm's stated values / principles", async () => {
    await ensureEmployerResearch("e1");
    const prompt = mocks.generateText.mock.calls[0][0].prompt as string;
    expect(prompt.toLowerCase()).toMatch(/values|principles/);
  });

  it("requests the division's day-to-day work", async () => {
    await ensureEmployerResearch("e1");
    const prompt = mocks.generateText.mock.calls[0][0].prompt as string;
    expect(prompt.toLowerCase()).toMatch(/day-to-day|day to day|typical day|what.*analyst.*do|daily work/);
  });

  it("requests discoverable application question structure / word caps", async () => {
    await ensureEmployerResearch("e1");
    const prompt = mocks.generateText.mock.calls[0][0].prompt as string;
    expect(prompt.toLowerCase()).toMatch(/word (?:cap|count|limit)|character (?:cap|count|limit)/);
    expect(prompt.toLowerCase()).toMatch(/question/);
  });

  it("still returns fresh cache content unchanged (caller-compatible)", async () => {
    const recent = new Date();
    mocks.findUnique.mockResolvedValue({ content: "CACHED", refreshedAt: recent });
    const out = await ensureEmployerResearch("e1");
    expect(out).toBe("CACHED");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("returns null when the employer is not in the catalog (unchanged behavior)", async () => {
    mocks.findUniqueEmployer.mockResolvedValue(null);
    const out = await ensureEmployerResearch("missing");
    expect(out).toBeNull();
  });

  it("persists generated content and returns it (unchanged behavior)", async () => {
    const out = await ensureEmployerResearch("e1", "user1");
    expect(out).toBe("## Divisions\n...");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});
