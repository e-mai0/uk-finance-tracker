// src/test/cv-tools.test.ts
// Tests for buildCvTools — specifically the update_cv.execute handler.
// Uses vi.mock to replace the Prisma-backed persistCv with an in-memory stub.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cvDataSchema } from "@/lib/cv";

// ---------------------------------------------------------------------------
// In-memory stub for persistCv
// ---------------------------------------------------------------------------
const store = new Map<string, unknown>();

vi.mock("@/server/cv/store", () => ({
  persistCv: async (userId: string, cv: unknown) => {
    store.set(userId, cv);
    return cvDataSchema.parse(cv);
  },
}));

// Import after mock is in place
const { buildCvTools } = await import("@/server/ai/cv-tools");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("buildCvTools — update_cv execute", () => {
  const USER = "user-abc";

  beforeEach(() => {
    store.clear();
  });

  it("valid data: persists and returns { ok: true, cv }", async () => {
    const tools = buildCvTools(USER);
    const input = cvDataSchema.parse({
      fullName: "Eric Mai",
      contact: { email: "e@cam.ac.uk" },
      education: [
        {
          institution: "Cambridge",
          qualification: "Economics BA",
          dates: "Sep 2025 – Jun 2028",
          grade: "Predicted First",
          bullets: ["Micro", "Macro"],
        },
      ],
    });

    const execute = tools.update_cv.execute!;
    const result = await execute(input, {} as never);

    expect(result).toMatchObject({ ok: true });
    expect((result as { ok: boolean; cv: unknown }).cv).toMatchObject({
      fullName: "Eric Mai",
    });
    // Row was actually stored
    expect(store.has(USER)).toBe(true);
  });

  it("invalid data (type coercion fails): returns { error }", async () => {
    const tools = buildCvTools(USER);

    // Pass something that cvDataSchema will reject after type coercion
    // (education array contains non-object to force parse failure)
    const badInput = { education: ["not-an-object"] } as never;

    const execute = tools.update_cv.execute!;
    const result = await execute(badInput, {} as never);

    expect(result).toMatchObject({ error: "invalid CV shape" });
    // Nothing written to the store
    expect(store.has(USER)).toBe(false);
  });

  it("empty CV (all defaults) is accepted", async () => {
    const tools = buildCvTools(USER);
    const input = cvDataSchema.parse({});

    const execute = tools.update_cv.execute!;
    const result = await execute(input, {} as never);

    expect(result).toMatchObject({ ok: true });
  });
});
