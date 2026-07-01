// src/test/cv-tools-review.test.ts
// Adversarial-review held-out tests for the update_cv partial-payload fix
// (fix/cv-tools-partial-update). Independent fixtures and an independent
// SDK-pipeline mirror — deliberately NOT reusing the author's helper — so a
// shared-helper blind spot cannot hide a regression.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { asSchema, type Tool } from "ai";
import { cvDataSchema } from "@/lib/cv";

const reviewStore = new Map<string, unknown>();

vi.mock("@/server/cv/store", () => ({
  getBuiltCv: async (userId: string) => {
    const cv = reviewStore.get(userId);
    return cv
      ? { cv: cvDataSchema.parse(cv), formInput: null, chatSessionId: null }
      : null;
  },
  persistCv: async (userId: string, cv: unknown) => {
    reviewStore.set(userId, cv);
    return cvDataSchema.parse(cv);
  },
}));

const { buildCvTools } = await import("@/server/ai/cv-tools");

// Independent mirror of the SDK's parseToolCall validation step: validate the
// payload with the tool's schema IF the schema carries a validate step, else
// pass the raw value through — exactly the branch in safeValidateTypes.
async function runToolAsSdk(t: Tool, payload: unknown): Promise<unknown> {
  const schema = asSchema(t.inputSchema);
  const validated = schema.validate
    ? await schema.validate(payload)
    : { success: true as const, value: payload };
  if (!validated.success) throw validated.error;
  return t.execute!(validated.value as never, {} as never);
}

const ALL_CV_FIELDS = [
  "fullName",
  "headline",
  "contact",
  "summary",
  "education",
  "experience",
  "accomplishments",
  "projects",
  "skills",
  "interests",
  "sections",
] as const;

const seededCv = () =>
  cvDataSchema.parse({
    fullName: "Priya Shah",
    headline: "Mathematics undergraduate",
    contact: { email: "ps@warwick.ac.uk", phone: "+44 7111 222333", linkedin: "in/priyashah" },
    summary: "Quant-leaning maths student.",
    education: [{ institution: "Warwick", qualification: "MMath Mathematics" }],
    experience: [{ org: "Nova Markets", role: "Insight Week", bullets: ["Shadowed the rates desk"] }],
    accomplishments: [{ title: "UKMT Gold" }],
    projects: [{ name: "Monte Carlo pricer", bullets: ["Priced Asian options"] }],
    skills: [{ label: "Technical", items: ["Python", "R"] }],
    interests: ["chess", "bouldering"],
    sections: [{ heading: "Volunteering", entries: [{ primary: "Maths tutoring" }] }],
  });

describe("review: update_cv fix mechanism is pinned", () => {
  it("the model-facing schema carries NO SDK-side validate step (defaults cannot materialise before execute)", () => {
    const tools = buildCvTools("review-user");
    const schema = asSchema(tools.update_cv.inputSchema);
    // If anyone reverts to `inputSchema: cvDataSchema`, asSchema() gains a
    // zod-backed validate function and this assertion goes red.
    expect(schema.validate).toBeUndefined();
  });

  it("the model-facing JSON schema still advertises every CV field (no silent affordance loss)", () => {
    const tools = buildCvTools("review-user");
    const shape = JSON.stringify(asSchema(tools.update_cv.inputSchema).jsonSchema);
    for (const field of ALL_CV_FIELDS) {
      expect(shape).toContain(`"${field}"`);
    }
  });
});

describe("review: update_cv through an independent SDK-pipeline mirror", () => {
  const USER = "review-user";

  beforeEach(() => {
    reviewStore.clear();
  });

  it("sequential partial updates compose: neither call erases the other's work", async () => {
    reviewStore.set(USER, seededCv());
    const tools = buildCvTools(USER);

    await runToolAsSdk(tools.update_cv, {
      experience: [
        { org: "Nova Markets", role: "Insight Week", bullets: ["Shadowed the rates desk", "Presented a trade idea"] },
      ],
    });
    await runToolAsSdk(tools.update_cv, {
      education: [
        { institution: "Warwick", qualification: "MMath Mathematics", grade: "First (year 1)" },
      ],
    });

    const saved = cvDataSchema.parse(reviewStore.get(USER));
    expect(saved.experience[0]!.bullets).toEqual([
      "Shadowed the rates desk",
      "Presented a trade idea",
    ]);
    expect(saved.education[0]!.grade).toBe("First (year 1)");
    // Fields untouched by BOTH calls are still intact.
    expect(saved.summary).toBe("Quant-leaning maths student.");
    expect(saved.skills[0]!.items).toEqual(["Python", "R"]);
    expect(saved.interests).toEqual(["chess", "bouldering"]);
    expect(saved.sections[0]!.heading).toBe("Volunteering");
  });

  it("one call, three semantics: explicit [] clears, explicit value sets, omission preserves", async () => {
    reviewStore.set(USER, seededCv());
    const tools = buildCvTools(USER);

    await runToolAsSdk(tools.update_cv, {
      interests: [], // explicit clear
      summary: "Now targeting quant trading.", // explicit set
      // education / experience / skills / sections omitted → preserve
    });

    const saved = cvDataSchema.parse(reviewStore.get(USER));
    expect(saved.interests).toEqual([]);
    expect(saved.summary).toBe("Now targeting quant trading.");
    expect(saved.education).toEqual(seededCv().education);
    expect(saved.experience).toEqual(seededCv().experience);
    expect(saved.skills).toEqual(seededCv().skills);
    expect(saved.sections).toEqual(seededCv().sections);
  });

  it("contact: {} (empty object) preserves every existing contact subfield", async () => {
    reviewStore.set(USER, seededCv());
    const tools = buildCvTools(USER);

    await runToolAsSdk(tools.update_cv, { contact: {} });

    const saved = cvDataSchema.parse(reviewStore.get(USER));
    expect(saved.contact.email).toBe("ps@warwick.ac.uk");
    expect(saved.contact.phone).toBe("+44 7111 222333");
    expect(saved.contact.linkedin).toBe("in/priyashah");
  });

  it("first-ever save from a partial payload works (no existing CV to merge into)", async () => {
    const tools = buildCvTools(USER);

    const result = await runToolAsSdk(tools.update_cv, {
      fullName: "Priya Shah",
      education: [{ institution: "Warwick", qualification: "MMath Mathematics" }],
    });

    expect(result).toMatchObject({ ok: true });
    const saved = cvDataSchema.parse(reviewStore.get(USER));
    expect(saved.fullName).toBe("Priya Shah");
    expect(saved.education).toHaveLength(1);
    // Omitted list fields default to empty on a first save — nothing to preserve.
    expect(saved.experience).toEqual([]);
    expect(saved.interests).toEqual([]);
  });

  it("unknown extra keys are stripped by validation inside execute, never persisted", async () => {
    reviewStore.set(USER, seededCv());
    const tools = buildCvTools(USER);

    const result = await runToolAsSdk(tools.update_cv, {
      summary: "Updated.",
      totallyBogusField: "should never be stored",
    });

    expect(result).toMatchObject({ ok: true });
    const savedRaw = reviewStore.get(USER) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(savedRaw, "totallyBogusField")).toBe(false);
    const saved = cvDataSchema.parse(savedRaw);
    expect(saved.summary).toBe("Updated.");
    expect(saved.education).toEqual(seededCv().education);
  });
});
