// src/test/cv-coach.test.ts
// U1 — CV coach opening. seedCoachOpening generates a grounded plain-text
// assessment + exactly 3 suggested-move chips and persists them as the CV
// session's first assistant ChatMessage with a stable clientId (dedup-safe).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/ai/budget", () => ({
  checkBudget: vi.fn(async () => ({ ok: true })),
  recordUsage: vi.fn(async () => {}),
}));

// Mock the LLM at the same boundary the rest of the repo mocks it (the `ai`
// module's generateText). The assessment-building logic under test consumes the
// REAL CvData we pass in — only the model call itself is faked.
const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({ generateText }));

// Mock the persistence layer (prisma) so we can assert dedup behaviour.
const { createMany } = vi.hoisted(() => ({ createMany: vi.fn() }));
vi.mock("@/server/db", () => ({
  prisma: { chatMessage: { createMany } },
}));

import { seedCoachOpening } from "@/server/cv/coach";
import { cvDataSchema, type CvData } from "@/lib/cv";

// A realistic CV with distinctive, uniquely-named content. The grounding test
// asserts the assessment mentions content DERIVED from this — proving it
// consumed the actual CvData, not a canned string.
function makeCv(): CvData {
  return cvDataSchema.parse({
    fullName: "Priya Nair",
    education: [
      {
        institution: "London School of Economics",
        qualification: "BSc Economics",
        dates: "Sep 2023 – Jun 2026",
        grade: "Predicted First",
      },
    ],
    experience: [
      {
        org: "Zentari Capital",
        role: "Spring Intern",
        dates: "Apr 2025",
        bullets: ["Responsible for updating spreadsheets", "Helped the team with research"],
      },
    ],
    skills: [{ label: "Technical", items: ["Python", "Bloomberg Terminal"] }],
  });
}

// A "model" response: the coach emits a grounded assessment followed by a
// minified JSON chips block. The assessment text references the real org name
// so the grounding assertion can prove the model consumed the CvData (the
// production prompt feeds cvToPlainText(cv) into the model).
function modelResponseFor(cv: CvData) {
  const org = cv.experience[0]?.org ?? "your role";
  return {
    text:
      `Your ${org} bullets read as duties, not impact, and there is no summary at the top. ` +
      `Strong LSE predicted First — lead with it.\n` +
      `\`\`\`json\n${JSON.stringify({
        chips: [
          { label: "Sharpen experience bullets", prompt: `Rewrite my ${org} bullets to show impact with numbers.` },
          { label: "Add a summary", prompt: "Draft a two-line summary for the top of my CV." },
          { label: "Tailor to a role", prompt: "Tailor my CV to a finance internship." },
        ],
      })}\n\`\`\``,
    usage: { totalTokens: 200 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "x";
  // Default: the persistence layer inserts one row (no pre-existing duplicate).
  createMany.mockResolvedValue({ count: 1 });
});

describe("seedCoachOpening — grounding", () => {
  it("assessment references injected distinctive CV fields (consumes real CvData)", async () => {
    const cv = makeCv();
    generateText.mockResolvedValueOnce(modelResponseFor(cv));

    await seedCoachOpening({ userId: "u1", sessionId: "s1", cv });

    // The model must have been called with a prompt that contains the CV's
    // actual content (proving the real CvData is fed in, not ignored).
    expect(generateText).toHaveBeenCalledOnce();
    const callArg = generateText.mock.calls[0][0] as { prompt: string };
    expect(callArg.prompt).toContain("Zentari Capital");
    expect(callArg.prompt).toContain("London School of Economics");

    // The persisted assessment text references content derived from the CV.
    const row = createMany.mock.calls[0][0].data[0] as { parts: string };
    const parts = JSON.parse(row.parts) as Array<{ type: string; text?: string }>;
    const textPart = parts.find((p) => p.type === "text");
    expect(textPart?.text).toContain("Zentari Capital");
  });
});

describe("seedCoachOpening — chips", () => {
  it("produces exactly 3 chips, each with a label and a prefilled prompt", async () => {
    const cv = makeCv();
    generateText.mockResolvedValueOnce(modelResponseFor(cv));

    await seedCoachOpening({ userId: "u1", sessionId: "s1", cv });

    const row = createMany.mock.calls[0][0].data[0] as { parts: string };
    const parts = JSON.parse(row.parts) as Array<{ type: string; data?: { chips?: unknown[] } }>;
    const chipPart = parts.find((p) => p.type === "data-coach-chips");
    expect(chipPart).toBeDefined();
    const chips = chipPart!.data!.chips as Array<{ label: string; prompt: string }>;
    expect(chips).toHaveLength(3);
    for (const chip of chips) {
      expect(typeof chip.label).toBe("string");
      expect(chip.label.length).toBeGreaterThan(0);
      expect(typeof chip.prompt).toBe("string");
      expect(chip.prompt.length).toBeGreaterThan(0);
    }
  });
});

describe("seedCoachOpening — stable clientId / dedup", () => {
  it("persists with a stable clientId derived from the sessionId", async () => {
    const cv = makeCv();
    generateText.mockResolvedValueOnce(modelResponseFor(cv));

    await seedCoachOpening({ userId: "u1", sessionId: "sess-xyz", cv });

    const args = createMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    const row = args.data[0] as { clientId: string; sessionId: string; role: string };
    expect(row.sessionId).toBe("sess-xyz");
    expect(row.role).toBe("assistant");
    expect(row.clientId).toBe("coach-opening:sess-xyz");
  });

  it("seeding twice for the same session is a dedup no-op (one row inserted)", async () => {
    const cv = makeCv();
    generateText.mockResolvedValue(modelResponseFor(cv));

    // First seed inserts the row.
    createMany.mockResolvedValueOnce({ count: 1 });
    await seedCoachOpening({ userId: "u1", sessionId: "s1", cv });
    const firstClientId = createMany.mock.calls[0][0].data[0].clientId;

    // Second seed: skipDuplicates means the unique (sessionId, clientId) row is
    // not re-inserted (count: 0). The clientId must be identical across runs.
    createMany.mockResolvedValueOnce({ count: 0 });
    await seedCoachOpening({ userId: "u1", sessionId: "s1", cv });
    const secondClientId = createMany.mock.calls[1][0].data[0].clientId;

    expect(secondClientId).toBe(firstClientId);
    // Both writes use skipDuplicates so the DB enforces single-row.
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(createMany.mock.calls[1][0].skipDuplicates).toBe(true);
    // Each call writes exactly one row for this session/clientId.
    expect(createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(createMany.mock.calls[1][0].data).toHaveLength(1);
  });
});

describe("seedCoachOpening — returns the opening as a UIMessage (F2)", () => {
  it("returns a message (id=clientId, role=assistant, text + chips parts) so the upload path can render it in place", async () => {
    const cv = makeCv();
    generateText.mockResolvedValueOnce(modelResponseFor(cv));

    const res = await seedCoachOpening({ userId: "u1", sessionId: "sess-xyz", cv });

    expect(res.seeded).toBe(true);
    expect(res.message).toBeDefined();
    const msg = res.message!;
    // id is the stable dedup clientId, so it matches the row toUIMessages later
    // assigns on a fresh /cv load (the in-place + persisted copies share an id).
    expect(msg.id).toBe("coach-opening:sess-xyz");
    expect(msg.id).toBe(res.clientId);
    expect(msg.role).toBe("assistant");
    // The returned parts must equal what was persisted to the DB row.
    const row = createMany.mock.calls[0][0].data[0] as { parts: string };
    expect(msg.parts).toEqual(JSON.parse(row.parts));
    const textPart = msg.parts.find((p) => p.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    expect(textPart?.text).toContain("Zentari Capital");
    const chipPart = msg.parts.find((p) => p.type === "data-coach-chips") as
      | { type: "data-coach-chips"; data: { chips: unknown[] } }
      | undefined;
    expect(chipPart!.data.chips).toHaveLength(3);
  });
});

describe("seedCoachOpening — graceful fallback", () => {
  it("does not throw when the LLM call fails; still seeds a generic opener", async () => {
    const cv = makeCv();
    generateText.mockRejectedValueOnce(new Error("model exploded"));

    await expect(
      seedCoachOpening({ userId: "u1", sessionId: "s1", cv }),
    ).resolves.not.toThrow();

    // Fallback still seeds a message (generic opener) so the refine pane is not
    // silent — with the stable clientId and 3 chips.
    expect(createMany).toHaveBeenCalledOnce();
    const row = createMany.mock.calls[0][0].data[0] as { clientId: string; parts: string };
    expect(row.clientId).toBe("coach-opening:s1");
    const parts = JSON.parse(row.parts) as Array<{ type: string; text?: string; data?: { chips?: unknown[] } }>;
    const textPart = parts.find((p) => p.type === "text");
    expect(textPart?.text?.length ?? 0).toBeGreaterThan(0);
    const chipPart = parts.find((p) => p.type === "data-coach-chips");
    expect((chipPart?.data?.chips as unknown[]).length).toBe(3);
  });

  it("does not throw when the budget is exhausted", async () => {
    const cv = makeCv();
    const { checkBudget } = await import("@/server/ai/budget");
    vi.mocked(checkBudget).mockResolvedValueOnce({ ok: false, spent: 999 });

    await expect(
      seedCoachOpening({ userId: "u1", sessionId: "s1", cv }),
    ).resolves.not.toThrow();
    // generateText is never called when over budget.
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does not throw when persistence fails (caller must not be blocked)", async () => {
    const cv = makeCv();
    generateText.mockResolvedValueOnce(modelResponseFor(cv));
    createMany.mockRejectedValueOnce(new Error("db down"));

    await expect(
      seedCoachOpening({ userId: "u1", sessionId: "s1", cv }),
    ).resolves.not.toThrow();
  });
});
