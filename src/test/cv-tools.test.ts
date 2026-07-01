// src/test/cv-tools.test.ts
// Tests for buildCvTools — specifically the update_cv.execute handler.
// Uses vi.mock to replace the Prisma-backed persistCv with an in-memory stub.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { asSchema, type Tool } from "ai";
import { cvDataSchema } from "@/lib/cv";

// ---------------------------------------------------------------------------
// In-memory stub for persistCv
// ---------------------------------------------------------------------------
const store = new Map<string, unknown>();

vi.mock("@/server/cv/store", () => ({
  getBuiltCv: async (userId: string) => {
    const cv = store.get(userId);
    return cv
      ? { cv: cvDataSchema.parse(cv), formInput: null, chatSessionId: null }
      : null;
  },
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

  it("preserves existing CV sections omitted from an edit payload", async () => {
    const existing = cvDataSchema.parse({
      fullName: "Eric Mai",
      contact: { email: "e@cam.ac.uk", phone: "+44 7000 000000" },
      education: [{ institution: "Cambridge", qualification: "Economics BA" }],
      experience: [
        {
          org: "Acme Capital",
          role: "Spring Intern",
          bullets: ["Built a portfolio monitoring dashboard"],
        },
      ],
      projects: [{ name: "Options pricer", bullets: ["Implemented Black-Scholes in Python"] }],
      skills: [{ label: "Technical", items: ["Python"] }],
    });
    store.set(USER, existing);
    const tools = buildCvTools(USER);

    const execute = tools.update_cv.execute!;
    const result = await execute(
      {
        fullName: "Eric Mai",
        contact: { email: "eric@example.com" },
        summary: "Finance student targeting markets roles.",
      } as never,
      {} as never,
    );

    expect(result).toMatchObject({ ok: true });
    const saved = cvDataSchema.parse(store.get(USER));
    expect(saved.summary).toBe("Finance student targeting markets roles.");
    expect(saved.contact.email).toBe("eric@example.com");
    expect(saved.contact.phone).toBe("+44 7000 000000");
    expect(saved.education).toEqual(existing.education);
    expect(saved.experience).toEqual(existing.experience);
    expect(saved.projects).toEqual(existing.projects);
    expect(saved.skills).toEqual(existing.skills);
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

// ---------------------------------------------------------------------------
// Production-path tests: run the model's raw JSON through the SAME validation
// pipeline the AI SDK applies before calling execute (parseToolCall →
// safeParseJSON → safeValidateTypes). This matters because a zod inputSchema
// with `.default([])` fields materialises empty arrays for every key the
// model omitted — so execute cannot tell "omitted" from "deliberately cleared"
// if defaults are applied at the validation stage.
// ---------------------------------------------------------------------------
async function executeViaSdkPipeline(t: Tool, modelJson: string): Promise<unknown> {
  const schema = asSchema(t.inputSchema);
  const value: unknown = modelJson.trim() === "" ? {} : JSON.parse(modelJson);
  const validated = schema.validate
    ? await schema.validate(value)
    : { success: true as const, value };
  if (!validated.success) throw validated.error;
  return t.execute!(validated.value as never, {} as never);
}

describe("buildCvTools — update_cv through the AI SDK validation pipeline", () => {
  const USER = "user-sdk";

  // NB: pre-trimmed — cvDataSchema intentionally trims all strings.
  const LONG_BULLET = (
    "Developed a cross-asset risk engine covering rates, credit and FX — " +
    "στρατηγική 対冲 模型 émigré café ✅📈 — ".repeat(30)
  ).trim();

  const existingFullCv = () =>
    cvDataSchema.parse({
      fullName: "Eric Mai",
      headline: "Economics undergraduate",
      contact: { email: "e@cam.ac.uk", phone: "+44 7000 000000" },
      summary: "Économiste en herbe — 想去伦敦工作 🎯",
      education: [{ institution: "Cambridge", qualification: "Economics BA" }],
      experience: [
        {
          org: "Acme Capital",
          role: "Spring Intern",
          bullets: [LONG_BULLET],
        },
      ],
      accomplishments: [{ title: "Investment competition finalist" }],
      projects: [{ name: "Options pricer", bullets: ["Implemented Black-Scholes in Python"] }],
      skills: [{ label: "Technical", items: ["Python"] }],
      interests: ["rowing"],
      sections: [{ heading: "Leadership", entries: [{ primary: "Treasurer" }] }],
    });

  beforeEach(() => {
    store.clear();
  });

  it("partial payload: sections the model omitted survive (SDK must not fill schema defaults)", async () => {
    const existing = existingFullCv();
    store.set(USER, existing);
    const tools = buildCvTools(USER);

    // The model updates ONLY experience + contact email + summary.
    const modelJson = JSON.stringify({
      fullName: "Eric Mai",
      contact: { email: "eric@example.com" },
      summary: "Finance student targeting markets roles.",
      experience: [
        {
          org: "Acme Capital",
          role: "Spring Intern",
          bullets: [LONG_BULLET, "Automated the desk's re-pricing job (10x faster)"],
        },
      ],
    });

    const result = await executeViaSdkPipeline(tools.update_cv, modelJson);

    expect(result).toMatchObject({ ok: true });
    const saved = cvDataSchema.parse(store.get(USER));
    // The fields the model sent were applied…
    expect(saved.summary).toBe("Finance student targeting markets roles.");
    expect(saved.contact.email).toBe("eric@example.com");
    expect(saved.experience[0]!.bullets).toEqual([
      LONG_BULLET,
      "Automated the desk's re-pricing job (10x faster)",
    ]);
    // …and everything it omitted is untouched.
    expect(saved.contact.phone).toBe("+44 7000 000000");
    expect(saved.headline).toBe(existing.headline);
    expect(saved.education).toEqual(existing.education);
    expect(saved.accomplishments).toEqual(existing.accomplishments);
    expect(saved.projects).toEqual(existing.projects);
    expect(saved.skills).toEqual(existing.skills);
    expect(saved.interests).toEqual(existing.interests);
    expect(saved.sections).toEqual(existing.sections);
  });

  it("explicit empty array in a partial payload clears THAT section and preserves the rest", async () => {
    const existing = existingFullCv();
    store.set(USER, existing);
    const tools = buildCvTools(USER);

    // Deliberate clear: the model explicitly sends interests: [].
    const result = await executeViaSdkPipeline(tools.update_cv, JSON.stringify({ interests: [] }));

    expect(result).toMatchObject({ ok: true });
    const saved = cvDataSchema.parse(store.get(USER));
    expect(saved.interests).toEqual([]);
    expect(saved.education).toEqual(existing.education);
    expect(saved.experience).toEqual(existing.experience);
    expect(saved.skills).toEqual(existing.skills);
    expect(saved.sections).toEqual(existing.sections);
  });

  it("full replacement payload can deliberately clear sections", async () => {
    const existing = existingFullCv();
    store.set(USER, existing);
    const tools = buildCvTools(USER);

    const replacement = {
      fullName: "Eric Mai",
      headline: "Economics undergraduate",
      contact: { email: "e@cam.ac.uk", phone: "+44 7000 000000" },
      summary: "Markets-focused student.",
      education: existing.education,
      experience: existing.experience,
      accomplishments: [],
      projects: [],
      skills: existing.skills,
      interests: [],
      sections: [],
    };

    const result = await executeViaSdkPipeline(tools.update_cv, JSON.stringify(replacement));

    expect(result).toMatchObject({ ok: true });
    const saved = cvDataSchema.parse(store.get(USER));
    expect(saved.accomplishments).toEqual([]);
    expect(saved.projects).toEqual([]);
    expect(saved.interests).toEqual([]);
    expect(saved.sections).toEqual([]);
    expect(saved.education).toEqual(existing.education);
    expect(saved.experience).toEqual(existing.experience);
  });

  it("empty tool input ({} payload) leaves the saved CV completely unchanged", async () => {
    const existing = existingFullCv();
    store.set(USER, existing);
    const tools = buildCvTools(USER);

    // parseToolCall validates {} when the model streams an empty input string.
    const result = await executeViaSdkPipeline(tools.update_cv, "");

    expect(result).toMatchObject({ ok: true });
    const saved = cvDataSchema.parse(store.get(USER));
    expect(saved).toEqual(existing);
  });

  it("unicode and long content in preserved sections survives byte-for-byte", async () => {
    const existing = existingFullCv();
    store.set(USER, existing);
    const tools = buildCvTools(USER);

    const result = await executeViaSdkPipeline(
      tools.update_cv,
      JSON.stringify({ headline: "Aspiring markets analyst" }),
    );

    expect(result).toMatchObject({ ok: true });
    const saved = cvDataSchema.parse(store.get(USER));
    expect(saved.headline).toBe("Aspiring markets analyst");
    expect(saved.summary).toBe("Économiste en herbe — 想去伦敦工作 🎯");
    expect(saved.experience[0]!.bullets[0]).toBe(LONG_BULLET);
  });

  it("invalid payload through the pipeline still returns { error } and writes nothing", async () => {
    const tools = buildCvTools(USER);

    let outcome: unknown;
    try {
      outcome = await executeViaSdkPipeline(
        tools.update_cv,
        JSON.stringify({ education: ["not-an-object"] }),
      );
    } catch (err) {
      outcome = { threw: err };
    }

    // Whether rejected at the validation stage or inside execute, the bad
    // payload must never reach the store.
    expect(store.has(USER)).toBe(false);
    expect(outcome).toBeDefined();
  });
});
