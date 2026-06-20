# Universal Apply Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the apply copilot understand and help complete *any* application form (Google Forms, bespoke bank portals, plus the existing 4 ATS) by replacing regex field-mapping with an LLM "fill plan", and add an ask-or-deduce triage panel that asks for facts it can't ground and drafts prose it can.

**Architecture:** A server-side "planning brain" (`/api/ext/plan`) receives a compact field schema from the in-page content script and returns a per-field `FillPlan` (fill / ask / draft / skip). A deterministic regex pre-pass resolves known fields cheaply; an LLM pass resolves the rest semantically. The content script applies `fill` items silently and renders `ask`/`draft` items in a three-bucket panel; answers the user gives are written back to their profile/answer-bank so they are never asked twice. The copilot never submits.

**Tech Stack:** Next.js (App Router, route handlers), Prisma, Zod, `@anthropic-ai/sdk` (Haiku for mapping/short answers, Sonnet for long-form), Vitest (node env, pure-logic tests in `src/test/`), MV3 browser extension built with Vite + CRXJS (`extension/`).

**Reference spec:** `docs/superpowers/specs/2026-06-07-apply-copilot-universal-forms-design.md`

**Testing note:** Vitest runs in `node` env over `src/test/**/*.test.ts` and the project has no DOM/extension test harness. Therefore all *testable* logic (matching, plan-building, prompt assembly, plan merge, write-back routing) lives in `src/lib/` and is TDD'd. Extension DOM/UI code is verified by building (`cd extension && npm run build`), loading the unpacked `extension/dist` in Chrome (`chrome://extensions` → Developer mode → Load unpacked), and exercising it on real pages. Each extension task ends with an explicit manual verification procedure.

**The shared contract (used across many tasks — defined in Task 1, repeated here for reference):**

```ts
type FieldType =
  | "text" | "email" | "tel" | "url" | "number"
  | "textarea" | "select" | "radio" | "checkbox" | "date";

interface FieldSchema {
  id: string;          // stable handle assigned by the serializer, e.g. "f0", "f1"
  label: string;
  nearbyText?: string; // sentence/legend near the field, for LLM disambiguation
  type: FieldType;
  options?: string[];  // present for select / radio
  required: boolean;
  charLimit?: number;
}

type FillAction = "fill" | "ask" | "draft" | "skip";

interface FillPlanItem {
  fieldId: string;     // matches FieldSchema.id
  action: FillAction;
  value?: string;      // present for action "fill"
  profileKey?: string; // known ApplyProfile/profile key when applicable (for write-back)
  confidence: number;  // 0..1
  question?: string;   // present for action "ask" — human-readable prompt
  reason?: string;     // short note for "ask"/"skip" shown on hover
}
```

---

## Phase A — Backend planning brain (TDD, server-side)

### Task 1: Shared plan contract (Zod request schema + exported types)

**Files:**
- Modify: `src/lib/validation.ts` (append the apply-copilot plan section)
- Test: `src/test/validation.test.ts` (append; create the import if absent)

- [ ] **Step 1: Write the failing test**

Append to `src/test/validation.test.ts` (add the import of `extPlanRequestSchema` to the existing import block at the top of the file):

```ts
import { extPlanRequestSchema } from "../lib/validation";

describe("extPlanRequestSchema", () => {
  const validField = {
    id: "f0",
    label: "Email",
    type: "email",
    required: true,
  };

  it("accepts a minimal valid request", () => {
    const r = extPlanRequestSchema.safeParse({ fields: [validField] });
    expect(r.success).toBe(true);
  });

  it("defaults required to false and trims label", () => {
    const r = extPlanRequestSchema.parse({
      fields: [{ id: "f1", label: "  Full name  ", type: "text" }],
    });
    expect(r.fields[0].required).toBe(false);
    expect(r.fields[0].label).toBe("Full name");
  });

  it("rejects an empty fields array", () => {
    const r = extPlanRequestSchema.safeParse({ fields: [] });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown field type", () => {
    const r = extPlanRequestSchema.safeParse({
      fields: [{ id: "f0", label: "x", type: "color" }],
    });
    expect(r.success).toBe(false);
  });

  it("caps fields at 200 to bound payload size", () => {
    const many = Array.from({ length: 201 }, (_, i) => ({
      id: `f${i}`,
      label: "x",
      type: "text",
    }));
    expect(extPlanRequestSchema.safeParse({ fields: many }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- validation`
Expected: FAIL — `extPlanRequestSchema` is not exported.

- [ ] **Step 3: Add the schema and types**

Append to `src/lib/validation.ts`:

```ts
// ---------------------------------------------------------------------------
// Apply copilot — universal form planning (/api/ext/plan)
// ---------------------------------------------------------------------------

export const FIELD_TYPES = [
  "text", "email", "tel", "url", "number",
  "textarea", "select", "radio", "checkbox", "date",
] as const;

export const fieldSchemaSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().max(400).default(""),
  nearbyText: z.string().trim().max(600).optional(),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string().trim().max(200)).max(80).optional(),
  required: z.boolean().default(false),
  charLimit: z.number().int().positive().max(20000).optional(),
});

export const extPlanRequestSchema = z.object({
  fields: z.array(fieldSchemaSchema).min(1).max(200),
  employer: optStr(160),
  role: optStr(200),
  url: optStr(500),
});

export type FieldSchema = z.infer<typeof fieldSchemaSchema>;
export type ExtPlanRequest = z.infer<typeof extPlanRequestSchema>;

export type FillAction = "fill" | "ask" | "draft" | "skip";

export interface FillPlanItem {
  fieldId: string;
  action: FillAction;
  value?: string;
  profileKey?: string;
  confidence: number;
  question?: string;
  reason?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- validation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/test/validation.test.ts
git commit -m "feat(copilot): add /api/ext/plan request schema and plan types"
```

---

### Task 2: Canonical field-key matcher (`src/lib/field-keys.ts`)

Move label→profile-key matching server-side as the single source of truth for the planner. (The extension keeps only DOM extraction; semantic matching now happens on the server.)

**Files:**
- Create: `src/lib/field-keys.ts`
- Test: `src/test/field-keys.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/field-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchKey, classifyQuestion } from "../lib/field-keys";

describe("matchKey", () => {
  it("maps common labels to known profile keys", () => {
    expect(matchKey("Email address")).toBe("email");
    expect(matchKey("First name")).toBe("firstName");
    expect(matchKey("LinkedIn profile")).toBe("linkedinUrl");
    expect(matchKey("Which university do you attend?")).toBe("university");
    expect(matchKey("Do you require sponsorship?")).toBe("requiresSponsorship");
  });

  it("returns null for an unrecognized label", () => {
    expect(matchKey("Favourite trading strategy")).toBeNull();
  });

  it("prefers the more specific firstName over fullName", () => {
    expect(matchKey("First name")).toBe("firstName");
  });
});

describe("classifyQuestion", () => {
  it("treats a long textarea prompt as an essay", () => {
    expect(
      classifyQuestion("Why do you want to work at Citadel?", "textarea"),
    ).toBe("essay");
  });

  it("treats a short factual field as factual", () => {
    expect(classifyQuestion("Expected salary", "number")).toBe("factual");
  });

  it("treats a textarea address block (no question hint) as factual", () => {
    expect(classifyQuestion("Additional information", "textarea")).toBe("factual");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- field-keys`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/field-keys.ts`**

```ts
/**
 * Canonical mapping from a form field's visible label to a known profile key,
 * and a heuristic for whether a free-text field is an essay (draft) or a short
 * factual field (ask). Server-side single source of truth for the planner.
 * Mirrors the value keys produced by `buildFieldMap` in server/ext-profile.ts.
 */

// Order matters — more specific patterns first.
const PATTERNS: [string, RegExp][] = [
  ["email", /\be-?mail\b/i],
  ["firstName", /\b(first|given)\s*name\b/i],
  ["lastName", /\b(last|family)\s*name\b|surname/i],
  ["fullName", /\bfull\s*name\b|\blegal name\b|^name\b|\byour name\b/i],
  ["phone", /\b(phone|mobile|telephone|tel)\b/i],
  ["linkedinUrl", /linkedin/i],
  ["githubUrl", /\b(github|portfolio)\b/i],
  ["websiteUrl", /\b(website|personal site|blog|url)\b/i],
  ["university", /\b(university|school|college|institution)\b/i],
  ["degreeType", /\b(degree type|qualification|level of study)\b/i],
  ["degree", /\b(degree|major|subject|course|field of study|discipline)\b/i],
  ["graduationDate", /\b(graduation date|expected graduation|completion date)\b/i],
  ["graduationYear", /\b(graduation|grad(uation)? year|year of graduation)\b/i],
  ["city", /\b(city|town)\b/i],
  ["country", /\bcountry\b/i],
  ["requiresSponsorship", /\bsponsor(ship)?\b/i],
  ["workAuthorizedUk", /\b(authori[sz]ed to work|right to work|legally.*work|work permit|eligib.*to work)\b/i],
  ["pronouns", /\bpronoun/i],
  ["gender", /\bgender\b/i],
  ["ethnicity", /\b(ethnic|race)\b/i],
  ["noticePeriod", /\bnotice period\b/i],
  ["earliestStart", /\b(start date|availability|available to start|earliest start)\b/i],
];

const QUESTION_HINT =
  /\b(why|describe|tell us|explain|motivat|interest|cover letter|what (makes|are)|how would|your experience|strengths?)\b/i;

/** Map a label to a known profile key, or null. */
export function matchKey(label: string): string | null {
  const l = label.toLowerCase();
  for (const [key, re] of PATTERNS) {
    if (re.test(l)) return key;
  }
  return null;
}

/**
 * Classify a free-text field. "essay" → draft prose for review;
 * "factual" → a short answer we should fill or ask for.
 */
export function classifyQuestion(
  label: string,
  type: string,
): "essay" | "factual" {
  if (type !== "textarea") return "factual";
  if (label.length > 12 && (label.includes("?") || QUESTION_HINT.test(label))) {
    return "essay";
  }
  return "factual";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- field-keys`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/field-keys.ts src/test/field-keys.test.ts
git commit -m "feat(copilot): canonical server-side field-key matcher + question classifier"
```

---

### Task 3: Deterministic plan builder (`src/lib/form-plan.ts`)

Pure pre-pass: turn `FieldSchema[]` + the user's known values into a `FillPlanItem[]`, deciding fill / ask / draft / skip. This is both the cheap fast-path and the offline fallback when the LLM is unavailable.

**Files:**
- Create: `src/lib/form-plan.ts`
- Test: `src/test/form-plan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/form-plan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDeterministicPlan } from "../lib/form-plan";
import type { FieldSchema } from "../lib/validation";

const f = (p: Partial<FieldSchema> & { id: string }): FieldSchema => ({
  label: "",
  type: "text",
  required: false,
  ...p,
});

const values = {
  email: "ada@example.com",
  firstName: "Ada",
  university: "Oxford",
};

describe("buildDeterministicPlan", () => {
  it("fills a known field that has a value", () => {
    const plan = buildDeterministicPlan([f({ id: "f0", label: "Email", type: "email" })], values);
    expect(plan[0]).toMatchObject({
      fieldId: "f0",
      action: "fill",
      value: "ada@example.com",
      profileKey: "email",
    });
    expect(plan[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("asks for a known key that has no stored value", () => {
    const plan = buildDeterministicPlan(
      [f({ id: "f0", label: "Phone number", type: "tel" })],
      values,
    );
    expect(plan[0].action).toBe("ask");
    expect(plan[0].profileKey).toBe("phone");
    expect(plan[0].question).toMatch(/phone/i);
  });

  it("drafts an essay-style textarea", () => {
    const plan = buildDeterministicPlan(
      [f({ id: "f0", label: "Why do you want to work here?", type: "textarea" })],
      values,
    );
    expect(plan[0].action).toBe("draft");
  });

  it("asks for an unrecognized factual field", () => {
    const plan = buildDeterministicPlan(
      [f({ id: "f0", label: "Expected salary (GBP)", type: "number" })],
      values,
    );
    expect(plan[0].action).toBe("ask");
    expect(plan[0].profileKey).toBeUndefined();
  });

  it("preserves field order and ids", () => {
    const plan = buildDeterministicPlan(
      [f({ id: "a", label: "Email", type: "email" }), f({ id: "b", label: "Salary", type: "number" })],
      values,
    );
    expect(plan.map((p) => p.fieldId)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- form-plan`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/form-plan.ts`**

```ts
import type { FieldSchema, FillPlanItem } from "./validation";
import { matchKey, classifyQuestion } from "./field-keys";

/**
 * Deterministic pre-pass. Decides each field with no LLM:
 *  - known key + stored value           → fill
 *  - essay textarea                      → draft
 *  - known key, no value / factual field → ask
 * Items the caller may want the LLM to re-examine are exactly the "ask" items
 * with no profileKey (genuinely unrecognized).
 */
export function buildDeterministicPlan(
  fields: FieldSchema[],
  values: Record<string, string>,
): FillPlanItem[] {
  return fields.map((field) => {
    const key = matchKey(field.label);

    if (key && values[key]) {
      return {
        fieldId: field.id,
        action: "fill",
        value: values[key],
        profileKey: key,
        confidence: 0.95,
      };
    }

    if (classifyQuestion(field.label, field.type) === "essay") {
      return { fieldId: field.id, action: "draft", confidence: 0.5 };
    }

    return {
      fieldId: field.id,
      action: "ask",
      profileKey: key ?? undefined,
      question: askText(field.label),
      confidence: key ? 0.6 : 0.3,
    };
  });
}

function askText(label: string): string {
  const clean = label.replace(/\s+/g, " ").trim();
  if (!clean) return "What should I enter here?";
  return clean.endsWith("?") ? clean : `${clean}?`;
}

/** The "ask" items the LLM pass should try to resolve (unrecognized only). */
export function unresolvedFieldIds(plan: FillPlanItem[]): string[] {
  return plan
    .filter((p) => p.action === "ask" && !p.profileKey)
    .map((p) => p.fieldId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- form-plan`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/form-plan.ts src/test/form-plan.test.ts
git commit -m "feat(copilot): deterministic fill-plan pre-pass"
```

---

### Task 4: LLM mapping pass — prompt builder + merge (in `form-plan.ts`) and `planForm()` (in `generate.ts`)

The LLM resolves the genuinely unrecognized `ask` fields by mapping them to existing profile values. The pure prompt-builder and merge are TDD'd; the LLM call is integration-tested manually.

**Files:**
- Modify: `src/lib/form-plan.ts`
- Modify: `src/server/ai/generate.ts`
- Test: `src/test/form-plan.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/test/form-plan.test.ts`:

```ts
import { buildMappingPrompt, mergeMappings } from "../lib/form-plan";

describe("buildMappingPrompt", () => {
  it("lists unresolved fields and the available value keys", () => {
    const prompt = buildMappingPrompt(
      [f({ id: "f0", label: "Where are you based?", type: "text" })],
      { city: "London", country: "United Kingdom" },
    );
    expect(prompt).toContain("f0");
    expect(prompt).toContain("Where are you based?");
    expect(prompt).toContain("city");
    expect(prompt).toContain("country");
  });
});

describe("mergeMappings", () => {
  const base = buildDeterministicPlan(
    [f({ id: "f0", label: "Where are you based?", type: "text" })],
    { city: "London" },
  );

  it("upgrades an unresolved ask to a fill when the LLM maps it", () => {
    const merged = mergeMappings(base, { city: "London" }, [
      { fieldId: "f0", profileKey: "city", confidence: 0.8 },
    ]);
    expect(merged[0]).toMatchObject({ action: "fill", value: "London", profileKey: "city" });
  });

  it("ignores a mapping to a key with no value", () => {
    const merged = mergeMappings(base, { city: "London" }, [
      { fieldId: "f0", profileKey: "phone", confidence: 0.8 },
    ]);
    expect(merged[0].action).toBe("ask");
  });

  it("ignores low-confidence mappings", () => {
    const merged = mergeMappings(base, { city: "London" }, [
      { fieldId: "f0", profileKey: "city", confidence: 0.3 },
    ]);
    expect(merged[0].action).toBe("ask");
  });

  it("leaves fields the LLM did not mention untouched", () => {
    const merged = mergeMappings(base, { city: "London" }, []);
    expect(merged[0].action).toBe("ask");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- form-plan`
Expected: FAIL — `buildMappingPrompt` / `mergeMappings` not exported.

- [ ] **Step 3: Implement the prompt builder + merge in `src/lib/form-plan.ts`**

Append to `src/lib/form-plan.ts`:

```ts
export interface LlmMapping {
  fieldId: string;
  profileKey: string;
  confidence: number;
}

const MIN_LLM_CONFIDENCE = 0.6;

/** Build the user-message text asking the LLM to map unresolved fields to value keys. */
export function buildMappingPrompt(
  unresolved: FieldSchema[],
  values: Record<string, string>,
): string {
  const keys = Object.keys(values);
  const fieldLines = unresolved
    .map((f) => {
      const opts = f.options?.length ? ` options=[${f.options.join(", ")}]` : "";
      const near = f.nearbyText ? ` context="${f.nearbyText}"` : "";
      return `- id=${f.id} type=${f.type} label="${f.label}"${opts}${near}`;
    })
    .join("\n");

  return [
    "Map each form field to ONE of the applicant's known value keys, or omit it if none fit.",
    "Only use keys from this list:",
    keys.map((k) => `  ${k} = ${values[k]}`).join("\n"),
    "",
    "Fields:",
    fieldLines,
    "",
    'Respond with JSON only: {"mappings":[{"fieldId":"...","profileKey":"...","confidence":0-1}]}.',
    "Omit a field entirely if no key is a confident match. Do not invent keys.",
  ].join("\n");
}

/**
 * Apply LLM mappings on top of the deterministic plan: a confident mapping to a
 * key that has a value upgrades that field's "ask" to a "fill".
 */
export function mergeMappings(
  plan: FillPlanItem[],
  values: Record<string, string>,
  mappings: LlmMapping[],
): FillPlanItem[] {
  const byId = new Map(mappings.map((m) => [m.fieldId, m]));
  return plan.map((item) => {
    if (item.action !== "ask") return item;
    const m = byId.get(item.fieldId);
    if (!m || m.confidence < MIN_LLM_CONFIDENCE) return item;
    const value = values[m.profileKey];
    if (!value) return item;
    return {
      ...item,
      action: "fill",
      value,
      profileKey: m.profileKey,
      confidence: m.confidence,
      question: undefined,
    };
  });
}

/** Parse the LLM's JSON response into mappings, tolerating prose/code fences. */
export function parseMappings(raw: string): LlmMapping[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { mappings?: unknown };
    if (!Array.isArray(parsed.mappings)) return [];
    return parsed.mappings
      .filter(
        (m): m is LlmMapping =>
          !!m &&
          typeof (m as LlmMapping).fieldId === "string" &&
          typeof (m as LlmMapping).profileKey === "string" &&
          typeof (m as LlmMapping).confidence === "number",
      )
      .map((m) => ({ fieldId: m.fieldId, profileKey: m.profileKey, confidence: m.confidence }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- form-plan`
Expected: PASS.

- [ ] **Step 5: Add `planForm()` to `src/server/ai/generate.ts`**

Append (it reuses the existing private `complete()` and `HAIKU` already defined at the top of the file):

```ts
import type { FieldSchema, FillPlanItem } from "../../lib/validation";
import {
  buildDeterministicPlan,
  unresolvedFieldIds,
  buildMappingPrompt,
  mergeMappings,
  parseMappings,
} from "../../lib/form-plan";

/**
 * Produce a fill plan for a form: deterministic pre-pass, then a single Haiku
 * call to semantically map any unrecognized fields to known values. Falls back
 * to the deterministic plan if AI is unconfigured or the call fails.
 */
export async function planForm(
  fields: FieldSchema[],
  values: Record<string, string>,
): Promise<FillPlanItem[]> {
  const base = buildDeterministicPlan(fields, values);
  const unresolvedIds = new Set(unresolvedFieldIds(base));
  if (unresolvedIds.size === 0 || !aiConfigured() || Object.keys(values).length === 0) {
    return base;
  }

  const unresolved = fields.filter((f) => unresolvedIds.has(f.id));
  const system =
    "You map job-application form fields to an applicant's known profile values. Be conservative: only map when confident. Respond with JSON only.";
  try {
    const raw = await complete(HAIKU, 800, system, buildMappingPrompt(unresolved, values));
    return mergeMappings(base, values, parseMappings(raw));
  } catch {
    return base; // network/model failure → still return the safe deterministic plan
  }
}
```

- [ ] **Step 6: Verify the full suite + typecheck**

Run: `npm run test` then `npx tsc --noEmit`
Expected: all tests PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/form-plan.ts src/server/ai/generate.ts src/test/form-plan.test.ts
git commit -m "feat(copilot): LLM field-mapping pass with safe deterministic fallback"
```

---

### Task 5: `/api/ext/plan` route

**Files:**
- Create: `src/app/api/ext/plan/route.ts`

- [ ] **Step 1: Implement the route**

Mirror the existing `src/app/api/ext/answer/route.ts` structure exactly (same relative-import depth, `requireToken`, `json`/`unauthorized`/`preflight`).

```ts
import { requireToken } from "../../../../server/ext-auth";
import { buildFieldMap } from "../../../../server/ext-profile";
import { planForm } from "../../../../server/ai/generate";
import { extPlanRequestSchema } from "../../../../lib/validation";
import { json, unauthorized, preflight } from "../../../../server/ext-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  const auth = await requireToken(req);
  if (!auth) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = extPlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid request.", fieldErrors: parsed.error.flatten().fieldErrors },
      400,
    );
  }

  const { fields } = parsed.data;
  const { fields: values } = await buildFieldMap(auth.userId);
  const plan = await planForm(fields, values);
  return json({ plan });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual integration check (with the dev server running and a real token)**

Mint a token: `npx tsx scripts/mint-test-token.ts` (prints a bearer token; this script already exists). Then:

```bash
curl -s -X POST http://localhost:3000/api/ext/plan \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"fields":[{"id":"f0","label":"Email","type":"email"},{"id":"f1","label":"Why this firm?","type":"textarea"},{"id":"f2","label":"Where are you based?","type":"text"}]}' | jq
```

Expected: a `plan` array — `f0` → `fill` (the account email), `f1` → `draft`, `f2` → `fill` or `ask` depending on whether a city is stored.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ext/plan/route.ts
git commit -m "feat(copilot): POST /api/ext/plan returns a fill plan"
```

---

### Task 6: Write-back of asked facts (`routeAskedAnswer` + `/api/ext/fact` route)

When the user answers a `❓`, persist it: a known `ApplyProfile` column gets updated; anything else becomes an `AnswerBankItem`.

**Files:**
- Modify: `src/lib/form-plan.ts`
- Create: `src/app/api/ext/fact/route.ts`
- Modify: `src/lib/validation.ts` (add `extFactSchema`)
- Test: `src/test/form-plan.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/test/form-plan.test.ts`:

```ts
import { routeAskedAnswer } from "../lib/form-plan";

describe("routeAskedAnswer", () => {
  it("routes a known profile key to its ApplyProfile column", () => {
    expect(routeAskedAnswer("phone", "Phone?", "+44 7…")).toEqual({
      target: "profile",
      column: "phone",
      value: "+44 7…",
    });
  });

  it("routes city to the addressCity column", () => {
    expect(routeAskedAnswer("city", "City?", "London")).toMatchObject({
      target: "profile",
      column: "addressCity",
    });
  });

  it("routes an unknown question to the answer bank", () => {
    expect(routeAskedAnswer(undefined, "Expected salary?", "55000")).toEqual({
      target: "bank",
      questionText: "Expected salary?",
      answer: "55000",
    });
  });

  it("routes a non-ApplyProfile profile key (e.g. firstName) to the bank", () => {
    // firstName is derived from the account name, not an ApplyProfile column.
    expect(routeAskedAnswer("firstName", "First name?", "Ada").target).toBe("bank");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- form-plan`
Expected: FAIL — `routeAskedAnswer` not exported.

- [ ] **Step 3: Implement `routeAskedAnswer` in `src/lib/form-plan.ts`**

Append:

```ts
export type FactRoute =
  | { target: "profile"; column: string; value: string }
  | { target: "bank"; questionText: string; answer: string };

// Profile keys that correspond to a writable ApplyProfile column.
const PROFILE_COLUMN_BY_KEY: Record<string, string> = {
  phone: "phone",
  city: "addressCity",
  country: "country",
  linkedinUrl: "linkedinUrl",
  githubUrl: "githubUrl",
  websiteUrl: "websiteUrl",
  pronouns: "pronouns",
  noticePeriod: "noticePeriod",
  earliestStart: "earliestStart",
  gender: "selfIdGender",
  ethnicity: "selfIdEthnicity",
};

/** Decide where an answer to an asked question should be persisted. */
export function routeAskedAnswer(
  profileKey: string | undefined,
  questionText: string,
  answer: string,
): FactRoute {
  const column = profileKey ? PROFILE_COLUMN_BY_KEY[profileKey] : undefined;
  if (column) return { target: "profile", column, value: answer };
  return { target: "bank", questionText, answer };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- form-plan`
Expected: PASS.

- [ ] **Step 5: Add `extFactSchema` to `src/lib/validation.ts`**

Append:

```ts
// Payload the extension POSTs to /api/ext/fact when the user answers a ❓.
export const extFactSchema = z.object({
  profileKey: optStr(60),
  questionText: z.string().trim().min(1).max(600),
  answer: z.string().trim().min(1).max(2000),
});

export type ExtFactInput = z.infer<typeof extFactSchema>;
```

- [ ] **Step 6: Implement `src/app/api/ext/fact/route.ts`**

```ts
import { Prisma } from "@prisma/client";
import { requireToken } from "../../../../server/ext-auth";
import { prisma } from "../../../../server/db";
import { routeAskedAnswer } from "../../../../lib/form-plan";
import { normalizeQuestion } from "../../../../lib/answers";
import { extFactSchema } from "../../../../lib/validation";
import { json, unauthorized, preflight } from "../../../../server/ext-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  const auth = await requireToken(req);
  if (!auth) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = extFactSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request." }, 400);
  }
  const { profileKey, questionText, answer } = parsed.data;
  const userId = auth.userId;
  const route = routeAskedAnswer(profileKey || undefined, questionText, answer);

  if (route.target === "profile") {
    // route.column is a string, so cast to Prisma's exact input types — a bare
    // computed-key object does not satisfy ApplyProfile{Create,Update}Input.
    await prisma.applyProfile.upsert({
      where: { userId },
      create: { userId, [route.column]: route.value } as Prisma.ApplyProfileUncheckedCreateInput,
      update: { [route.column]: route.value } as Prisma.ApplyProfileUncheckedUpdateInput,
    });
    return json({ saved: "profile", column: route.column });
  }

  const normalized = normalizeQuestion(route.questionText);
  const existing = await prisma.answerBankItem.findFirst({
    where: { userId, questionNormalized: normalized },
    select: { id: true },
  });
  if (existing) {
    await prisma.answerBankItem.update({
      where: { id: existing.id },
      data: { answer: route.answer },
    });
  } else {
    await prisma.answerBankItem.create({
      data: {
        userId,
        questionText: route.questionText,
        questionNormalized: normalized,
        answer: route.answer,
      },
    });
  }
  return json({ saved: "bank" });
}
```

- [ ] **Step 7: Typecheck + full suite**

Run: `npx tsc --noEmit` then `npm run test`
Expected: no type errors; all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/form-plan.ts src/lib/validation.ts src/app/api/ext/fact/route.ts src/test/form-plan.test.ts
git commit -m "feat(copilot): persist asked facts to profile or answer bank (/api/ext/fact)"
```

---

## Phase B — Extension transport layer

### Task 7: Extension shared types + background plan/fact handlers

**Files:**
- Modify: `extension/src/shared/types.ts`
- Modify: `extension/src/background.ts`

- [ ] **Step 1: Add types to `extension/src/shared/types.ts`**

Append (keep in sync with `src/lib/validation.ts` — same shapes):

```ts
export type FieldType =
  | "text" | "email" | "tel" | "url" | "number"
  | "textarea" | "select" | "radio" | "checkbox" | "date";

export interface FieldSchema {
  id: string;
  label: string;
  nearbyText?: string;
  type: FieldType;
  options?: string[];
  required: boolean;
  charLimit?: number;
}

export type FillAction = "fill" | "ask" | "draft" | "skip";

export interface FillPlanItem {
  fieldId: string;
  action: FillAction;
  value?: string;
  profileKey?: string;
  confidence: number;
  question?: string;
  reason?: string;
}

export interface PlanPayload {
  fields: FieldSchema[];
  employer?: string;
  role?: string;
  url?: string;
}

export interface FactPayload {
  profileKey?: string;
  questionText: string;
  answer: string;
}
```

Then extend the `BgRequest` union (add two members):

```ts
  | { type: "plan"; payload: PlanPayload }
  | { type: "saveFact"; payload: FactPayload }
```

- [ ] **Step 2: Add background handlers in `extension/src/background.ts`**

Add two cases to the `switch (msg.type)` block (alongside `answer`/`trackApplication`):

```ts
        case "plan":
          sendResponse(
            await apiFetch("/api/ext/plan", {
              method: "POST",
              body: JSON.stringify(msg.payload),
            }),
          );
          break;
        case "saveFact":
          sendResponse(
            await apiFetch("/api/ext/fact", {
              method: "POST",
              body: JSON.stringify(msg.payload),
            }),
          );
          break;
```

- [ ] **Step 3: Typecheck the extension**

Run: `cd extension && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add extension/src/shared/types.ts extension/src/background.ts
git commit -m "feat(copilot/ext): plan + saveFact message transport"
```

---

## Phase C — Extension form serialization + plan application

### Task 8: DOM → FieldSchema serializer (`extension/src/content/serialize.ts`)

**Files:**
- Create: `extension/src/content/serialize.ts`

Reuses `getLabelText` and `collectFields` from the existing `field-map.ts` (unchanged). Assigns each fillable element a stable id via a `data-cyclops-fid` attribute and returns both the schema and a lookup map from id → element.

- [ ] **Step 1: Implement `extension/src/content/serialize.ts`**

```ts
import { getLabelText, collectFields, type FillableEl } from "./field-map";
import type { FieldSchema, FieldType } from "../shared/types";

export interface SerializedForm {
  fields: FieldSchema[];
  elements: Map<string, FillableEl>;
}

function fieldType(el: FillableEl): FieldType {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return "select";
  const t = (el.type || "text").toLowerCase();
  if (t === "email") return "email";
  if (t === "tel") return "tel";
  if (t === "url") return "url";
  if (t === "number") return "number";
  if (t === "date") return "date";
  if (t === "radio") return "radio";
  if (t === "checkbox") return "checkbox";
  return "text";
}

function optionsFor(el: FillableEl): string[] | undefined {
  if (el instanceof HTMLSelectElement) {
    const opts = Array.from(el.options).map((o) => o.text.trim()).filter(Boolean);
    return opts.length ? opts.slice(0, 80) : undefined;
  }
  return undefined;
}

/** Walk a form container into a compact FieldSchema[] plus an id→element map. */
export function serializeForm(root: ParentNode): SerializedForm {
  const elements = new Map<string, FillableEl>();
  const fields: FieldSchema[] = [];
  const seenRadioGroups = new Set<string>();
  let i = 0;

  for (const el of collectFields(root)) {
    // Collapse radio groups to one schema field, keyed on the first radio.
    if (el instanceof HTMLInputElement && el.type === "radio") {
      if (!el.name || seenRadioGroups.has(el.name)) continue;
      seenRadioGroups.add(el.name);
    }

    const id = `f${i++}`;
    el.setAttribute("data-cyclops-fid", id);
    elements.set(id, el);

    const type = fieldType(el);
    const options =
      type === "radio" && el instanceof HTMLInputElement && el.name
        ? radioOptions(root, el.name)
        : optionsFor(el);

    fields.push({
      id,
      label: getLabelText(el),
      type,
      options,
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
      charLimit:
        el instanceof HTMLTextAreaElement && el.maxLength > 0 ? el.maxLength : undefined,
    });
  }

  return { fields, elements };
}

function radioOptions(root: ParentNode, name: string): string[] | undefined {
  const radios = Array.from(
    root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`),
  );
  const labels = radios.map((r) => getLabelText(r)).filter(Boolean);
  return labels.length ? labels : undefined;
}
```

- [ ] **Step 2: Typecheck the extension**

Run: `cd extension && npm run typecheck`
Expected: no errors. (If `FillableEl` is not exported from `field-map.ts`, add `export` to its `type FillableEl` declaration — it is already exported.)

- [ ] **Step 3: Commit**

```bash
git add extension/src/content/serialize.ts
git commit -m "feat(copilot/ext): serialize a form into a compact field schema"
```

---

### Task 9: Apply a FillPlan (`extension/src/content/autofill.ts`)

Add a `applyPlan` function that consumes a `FillPlanItem[]` + the id→element map, fills `fill` items, and returns the `ask`/`draft` buckets for the panel. Keep the existing `setNativeValue`/`insertIntoField`/`fillSelect`/`fillRadioGroup` helpers (reused).

**Files:**
- Modify: `extension/src/content/autofill.ts`

- [ ] **Step 1: Add `applyPlan` + a public `setFieldValue` to `extension/src/content/autofill.ts`**

Append:

```ts
import type { FillableEl } from "./field-map";
import type { FieldSchema, FillPlanItem } from "../shared/types";

export interface PlanQuestion {
  fieldId: string;
  el: FillableEl;          // input, textarea, OR select/radio
  label: string;
  profileKey?: string;
  charLimit?: number;
  options?: string[];      // present for select/radio asks — drives the ask UI
}

export interface AppliedPlan {
  filled: number;
  asks: PlanQuestion[];   // action "ask"
  drafts: PlanQuestion[]; // action "draft"
}

/** Apply a fill plan to the live form; collect ask/draft items for the panel. */
export function applyPlan(
  plan: FillPlanItem[],
  elements: Map<string, FillableEl>,
  schemaById: Map<string, FieldSchema>,
): AppliedPlan {
  let filled = 0;
  const asks: PlanQuestion[] = [];
  const drafts: PlanQuestion[] = [];

  for (const item of plan) {
    const el = elements.get(item.fieldId);
    if (!el) continue;
    const schema = schemaById.get(item.fieldId);
    const label = schema?.label ?? "";

    if (item.action === "fill" && item.value != null) {
      if (setFieldValue(el, item.value)) filled++;
      continue;
    }
    if (item.action === "draft" && el instanceof HTMLTextAreaElement) {
      drafts.push({ fieldId: item.fieldId, el, label, charLimit: item.charLimit });
      continue;
    }
    if (item.action === "ask") {
      asks.push({
        fieldId: item.fieldId,
        el,
        label: item.question || label,
        profileKey: item.profileKey,
        options: schema?.options,
      });
    }
  }
  return { filled, asks, drafts };
}

/** Set a value on ANY fillable element type (text/textarea/select/radio). Public so the panel's ask cards can use it. */
export function setFieldValue(el: FillableEl, value: string): boolean {
  if (el instanceof HTMLSelectElement) return fillSelect(el, value);
  if (el instanceof HTMLInputElement && el.type === "radio") {
    const group = el.name
      ? Array.from(
          document.querySelectorAll<HTMLInputElement>(
            `input[type="radio"][name="${CSS.escape(el.name)}"]`,
          ),
        )
      : [el];
    return fillRadioGroup(group, value);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, value);
    return true;
  }
  return false;
}
```

Note: `fillSelect`, `fillRadioGroup`, and `setNativeValue` are module-private in this file — `setFieldValue` reuses them directly, no extra exports needed.

- [ ] **Step 1b: Remove dead code from `autofill.ts`**

The old `fillForm` export and the `matchKey, isFreeTextQuestion` imports at the top of `autofill.ts` are no longer used after Task 12 rewrites `index.ts`. Delete the `fillForm` function and trim the top import to `import { getLabelText } from "./field-map";` (`getLabelText` is still used by `fillRadioGroup`; `collectFields`/`matchKey`/`isFreeTextQuestion` were only used by `fillForm`, and `fillSelect`/`fillRadioGroup`/`setNativeValue`/`insertIntoField` are defined locally and stay). Verify nothing else imports `fillForm` (only the old `index.ts` did).

- [ ] **Step 2: Typecheck the extension**

Run: `cd extension && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add extension/src/content/autofill.ts
git commit -m "feat(copilot/ext): apply a fill plan and bucket ask/draft items"
```

---

## Phase D — Detector + cue + manifest

### Task 10: Application-form detector + dormant cue (`extension/src/content/detect.ts`) and `<all_urls>`

**Files:**
- Create: `extension/src/content/detect.ts`
- Modify: `extension/manifest.json`

- [ ] **Step 1: Implement `extension/src/content/detect.ts`**

```ts
/**
 * Lightweight, network-free heuristic that decides whether the current page
 * looks like an application form, plus a dormant bottom-right "cue" pill. The
 * panel (and any network call) is only created when the user clicks the cue.
 */

const APPLY_HINT =
  /\b(apply|application|cover letter|why (do|are) you|right to work|sponsorship|notice period|cv|resume)\b/i;

/** True if the page has a form-like cluster of inputs and application wording. */
export function looksLikeApplication(doc: Document = document): boolean {
  const fields = doc.querySelectorAll(
    "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select",
  );
  if (fields.length < 4) return false;
  const hasTextarea = doc.querySelector("textarea") != null;
  const text = (doc.body?.innerText || "").slice(0, 5000);
  return hasTextarea || APPLY_HINT.test(text);
}

/** Mount the dormant cue. Calls onEngage exactly once when clicked. */
export function mountCue(onEngage: () => void): () => void {
  if (document.getElementById("cyclops-cue-root")) return () => {};
  const host = document.createElement("div");
  host.id = "cyclops-cue-root";
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .cue {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 14px; border-radius: 999px; cursor: pointer;
      font-family: ui-sans-serif, system-ui, sans-serif; font-size: 13px; font-weight: 600;
      color: #fdf6f0; background: #7c2433; border: 0;
      box-shadow: 0 8px 24px -8px rgba(0,0,0,.4);
    }
    .cue:hover { background: #641b27; }
  `;
  root.appendChild(style);

  const btn = document.createElement("button");
  btn.className = "cue";
  btn.textContent = "◆ Cyclops — apply with copilot";
  btn.addEventListener("click", () => {
    host.remove();
    onEngage();
  });
  root.appendChild(btn);
  document.body.appendChild(host);

  return () => host.remove();
}
```

- [ ] **Step 2: Update `extension/manifest.json`**

Add an `<all_urls>` detector content script entry. The existing 4-host entry stays (it can keep loading the full `index.ts`); the detector runs everywhere else. Replace the `content_scripts` array so the detector covers all pages and `index.ts` continues to cover known ATS:

```json
  "host_permissions": [
    "<all_urls>",
    "http://localhost:3000/*",
    "https://cyclops-brown.vercel.app/*"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "exclude_matches": ["http://localhost:3000/*", "https://cyclops-brown.vercel.app/*"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    },
    {
      "matches": ["http://localhost:3000/*", "https://cyclops-brown.vercel.app/*"],
      "js": ["src/content/connect.ts"],
      "run_at": "document_idle"
    }
  ],
```

The `exclude_matches` keeps the copilot cue off our own Cyclops app pages (which have their own forms) while the `connect.ts` script continues to run there for token handoff. (`index.ts` will be rewritten in Task 12 to start with detection rather than auto-mounting, so a single `<all_urls>` entry is correct.)

- [ ] **Step 3: Build the extension**

Run: `cd extension && npm run build`
Expected: build succeeds, `extension/dist` is produced.

- [ ] **Step 4: Commit**

```bash
git add extension/src/content/detect.ts extension/manifest.json
git commit -m "feat(copilot/ext): network-free application detector + dormant cue, <all_urls>"
```

---

## Phase E — Panel triage + orchestration

### Task 11: Three-bucket triage panel (`extension/src/content/panel.ts`)

Rewrite the panel body to render: a collapsed "Filled N fields" summary, a `❓ Needs you` list (one input per ask, with a "fill & save" action), and a `✏️ Drafts to review` list (the existing draft/insert/save card, reused).

**Files:**
- Modify: `extension/src/content/panel.ts`

- [ ] **Step 1: Update `PanelHandlers`, delete the old methods, and add the triage renderer**

Replace the `PanelHandlers` interface, and **delete the now-obsolete `showFilled` and `questionCard` methods** (they reference the removed `onAutofill`/`onSave` handlers and `onGenerate(index)`/`onInsert(index)` index-based signatures — leaving them in place will fail the typecheck). New handler shape:

```ts
export interface AskItem { fieldId: string; label: string; profileKey?: string; options?: string[]; }
export interface DraftItem { fieldId: string; label: string; charLimit?: number; }

export interface PanelHandlers {
  onEngage: () => void;                                   // user clicked "Autofill / plan this form"
  onAnswerAsk: (fieldId: string, value: string) => Promise<boolean>; // fill + write-back
  onGenerate: (fieldId: string) => Promise<string | null>;
  onInsert: (fieldId: string, text: string) => void;
  onSaveDraft: (fieldId: string, label: string, text: string) => Promise<boolean>;
}
```

Add a `showTriage` method (keep the existing `mount`/`remove`/`setStatus`/`showConnectPrompt`/`showError`/`el` helpers and the Shadow-DOM shell):

```ts
showTriage(filled: number, asks: AskItem[], drafts: DraftItem[]) {
  this.clearBody();

  const summary = el("p", "muted");
  summary.innerHTML = `✅ Filled <strong>${filled}</strong> field${filled === 1 ? "" : "s"}. Review before submitting.`;
  this.body.append(summary);

  if (asks.length) {
    const h = el("p", "muted");
    h.style.marginTop = "12px";
    h.textContent = `❓ Needs you (${asks.length})`;
    this.body.append(h);
    asks.forEach((a) => this.body.append(this.askCard(a)));
  }

  if (drafts.length) {
    const h = el("p", "muted");
    h.style.marginTop = "12px";
    h.textContent = `✏️ Drafts to review (${drafts.length})`;
    this.body.append(h);
    drafts.forEach((d) => this.body.append(this.draftCard(d)));
  }

  if (!asks.length && !drafts.length) {
    const none = el("p", "muted");
    none.style.marginTop = "10px";
    none.textContent = "Nothing else needs you on this step.";
    this.body.append(none);
  }
}

private askCard(a: AskItem): HTMLElement {
  const card = el("div", "q");
  const label = el("p", "q-label");
  label.textContent = a.label;

  // select/radio asks render a dropdown of the field's options; everything
  // else gets a free-text box. `readValue` abstracts the two.
  let readValue: () => string;
  let control: HTMLElement;
  if (a.options && a.options.length) {
    const sel = el("select") as HTMLSelectElement;
    sel.style.cssText = "width:100%;box-sizing:border-box;font:inherit;font-size:12px;padding:6px;border:1px solid #d6cfbd;border-radius:6px;background:#fff;";
    const placeholder = document.createElement("option");
    placeholder.value = ""; placeholder.textContent = "— select —";
    sel.append(placeholder);
    for (const opt of a.options) {
      const o = document.createElement("option");
      o.value = opt; o.textContent = opt;
      sel.append(o);
    }
    control = sel;
    readValue = () => sel.value.trim();
  } else {
    const input = el("textarea") as HTMLTextAreaElement;
    input.style.minHeight = "38px";
    control = input;
    readValue = () => input.value.trim();
  }

  const actions = el("div", "q-actions");
  const fill = el<HTMLButtonElement>("button", "btn row");
  fill.textContent = "Fill & save";
  const msg = el("span", "err");
  msg.style.display = "none";

  fill.addEventListener("click", async () => {
    const value = readValue();
    if (!value) return;
    fill.disabled = true;
    const ok = await this.handlers.onAnswerAsk(a.fieldId, value);
    fill.textContent = ok ? "Saved ✓" : "Failed";
    if (!ok) { msg.textContent = "Couldn’t save — is the extension connected?"; msg.style.display = "block"; }
    setTimeout(() => { fill.disabled = false; fill.textContent = "Fill & save"; }, 1500);
  });

  actions.append(fill);
  card.append(label, control, actions, msg);
  return card;
}

private draftCard(d: DraftItem): HTMLElement {
  // Same structure as the current questionCard, but keyed by fieldId and using
  // onGenerate(fieldId)/onInsert(fieldId)/onSaveDraft(fieldId, label, text).
  const card = el("div", "q");
  const label = el("p", "q-label");
  label.textContent = d.label + (d.charLimit ? `  (max ${d.charLimit} chars)` : "");
  const ta = el("textarea") as HTMLTextAreaElement;
  ta.placeholder = "Click Draft to generate an answer…";
  const actions = el("div", "q-actions");
  const draft = el<HTMLButtonElement>("button", "btn sec row"); draft.textContent = "Draft";
  const insert = el<HTMLButtonElement>("button", "btn row"); insert.textContent = "Insert";
  const save = el<HTMLButtonElement>("button", "btn sec row"); save.textContent = "Save to bank";
  const msg = el("span", "err"); msg.style.display = "none";

  draft.addEventListener("click", async () => {
    draft.disabled = true; draft.textContent = "Drafting…"; msg.style.display = "none";
    const text = await this.handlers.onGenerate(d.fieldId);
    draft.disabled = false; draft.textContent = "Redraft";
    if (text == null) { msg.textContent = "Couldn’t generate — check the popup is connected."; msg.style.display = "block"; }
    else ta.value = text;
  });
  insert.addEventListener("click", () => { if (ta.value.trim()) this.handlers.onInsert(d.fieldId, ta.value); });
  save.addEventListener("click", async () => {
    if (!ta.value.trim()) return;
    save.disabled = true;
    const ok = await this.handlers.onSaveDraft(d.fieldId, d.label, ta.value);
    save.textContent = ok ? "Saved ✓" : "Save failed";
    setTimeout(() => { save.disabled = false; save.textContent = "Save to bank"; }, 1500);
  });

  actions.append(draft, insert, save);
  card.append(label, ta, actions, msg);
  return card;
}
```

Also update `showReady` so its button calls `this.handlers.onEngage()` instead of the removed `onAutofill`.

- [ ] **Step 2: Typecheck the extension**

Run: `cd extension && npm run typecheck`
Expected: no errors (errors in `index.ts` are expected until Task 12; if so, proceed to Task 12 and typecheck at its end).

- [ ] **Step 3: Commit**

```bash
git add extension/src/content/panel.ts
git commit -m "feat(copilot/ext): three-bucket triage panel with ask cards"
```

---

### Task 12: Orchestrate detect → engage → plan → apply → triage (`extension/src/content/index.ts`)

Rewrite the content-script entry point to: detect, show the cue, and on engage build the schema, request a plan, apply it, render the triage, and wire write-backs.

**Files:**
- Modify: `extension/src/content/index.ts`

- [ ] **Step 1: Rewrite `extension/src/content/index.ts`**

```ts
import { pickAdapter } from "./adapters";
import { serializeForm, type SerializedForm } from "./serialize";
import { applyPlan, insertIntoField, setFieldValue, type PlanQuestion } from "./autofill";
import { Panel } from "./panel";
import { send } from "./messaging";
import { looksLikeApplication, mountCue } from "./detect";
import type { FieldSchema, FillPlanItem } from "../shared/types";

const adapter = pickAdapter();
let mounted = false;
let serialized: SerializedForm | null = null;
let askIndex = new Map<string, PlanQuestion>();
let draftIndex = new Map<string, PlanQuestion>();

const panel = new Panel({
  onEngage: engage,
  onAnswerAsk: async (fieldId, value) => {
    const q = askIndex.get(fieldId);
    if (!q) return false;
    setFieldValue(q.el, value); // handles text, textarea, select, and radio
    const res = await send({
      type: "saveFact",
      payload: { profileKey: q.profileKey, questionText: q.label, answer: value },
    });
    return res.ok;
  },
  onGenerate: async (fieldId) => {
    const q = draftIndex.get(fieldId);
    if (!q) return null;
    const { employer, role } = adapter.employerRole();
    const res = await send<{ answer?: string }>({
      type: "answer",
      payload: {
        questionText: q.label, questionType: "long", charLimit: q.charLimit,
        employer, role, externalUrl: location.href.split("#")[0],
      },
    });
    return res.ok && res.data?.answer ? res.data.answer : null;
  },
  onInsert: (fieldId, text) => {
    const q = draftIndex.get(fieldId);
    if (q) insertIntoField(q.el, text);
  },
  onSaveDraft: async (fieldId, label, text) => {
    const { employer } = adapter.employerRole();
    const res = await send({
      type: "answer",
      payload: { questionText: label, answer: text, employer, save: true },
    });
    return res.ok;
  },
});

function formContainer(): ParentNode | null {
  return adapter.formContainer() ?? (looksLikeApplication() ? document.body : null);
}

async function engage() {
  const container = formContainer();
  if (!container) { panel.showError("No application form found on this page."); return; }

  const status = await send<{ connected: boolean }>({ type: "status" });
  if (!status.ok || !status.data?.connected) { panel.showConnectPrompt(); return; }

  serialized = serializeForm(container);
  const schemaById = new Map(serialized.fields.map((f) => [f.id, f]));
  const { employer, role } = adapter.employerRole();

  const res = await send<{ plan: FillPlanItem[] }>({
    type: "plan",
    payload: { fields: serialized.fields as FieldSchema[], employer, role, url: location.href.split("#")[0] },
  });
  if (!res.ok || !res.data?.plan) { panel.showError(res.error || "Couldn’t plan this form."); return; }

  const applied = applyPlan(res.data.plan, serialized.elements, schemaById);
  askIndex = new Map(applied.asks.map((q) => [q.fieldId, q]));
  draftIndex = new Map(applied.drafts.map((q) => [q.fieldId, q]));

  panel.showTriage(
    applied.filled,
    applied.asks.map((q) => ({ fieldId: q.fieldId, label: q.label, profileKey: q.profileKey, options: q.options })),
    applied.drafts.map((q) => ({ fieldId: q.fieldId, label: q.label, charLimit: q.charLimit })),
  );

  void send({
    type: "trackApplication",
    payload: {
      externalUrl: location.href.split("#")[0], ats: adapter.kind,
      employerName: employer, roleTitle: role, status: "AUTOFILLED",
    },
  });
}

function init() {
  if (mounted) return;
  if (!formContainer()) return;
  mounted = true;
  mountCue(() => { panel.mount(); panel.setStatus(""); void engage(); });
}

void init();

// Re-check on DOM changes for SPA-rendered forms, debounced so the heuristic
// (which scans innerText) runs at most ~once / 300ms on busy pages, and stops
// observing as soon as we've mounted the cue.
let debounce: ReturnType<typeof setTimeout> | null = null;
const observer = new MutationObserver(() => {
  if (mounted) { observer.disconnect(); return; }
  if (debounce) return;
  debounce = setTimeout(() => { debounce = null; init(); }, 300);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
setTimeout(() => observer.disconnect(), 20000);
```

- [ ] **Step 2: Typecheck + build the extension**

Run: `cd extension && npm run typecheck && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 3: Manual end-to-end verification**

With the Next.js dev server running and the extension connected (Settings → Browser extension → paste token into the popup):

1. **Known ATS parity:** open a Greenhouse/Lever test application. Expect the cue → click → standard fields auto-filled, essay questions in the `✏️` bucket. No regression vs. before.
2. **Google Form:** open a Google Form with name/email/short-answer questions. Expect the cue to appear, known fields filled, unknowns in `❓` with inputs, and answering one writes it back (re-open another form with the same question → no longer asked, served from the bank).
3. **Bespoke page:** open any page with a 4+ field form and application wording. Expect detection + a usable plan.
4. **Privacy:** with DevTools Network open on a non-application page, confirm the detector makes no request; on an application page, confirm no request fires until the cue is clicked.
5. **Never submits:** confirm no submit button is ever clicked by the copilot.

- [ ] **Step 4: Commit**

```bash
git add extension/src/content/index.ts
git commit -m "feat(copilot/ext): orchestrate detect → plan → apply → triage with write-back"
```

---

## Final verification

- [ ] Run the full server test suite: `npm run test` — all PASS.
- [ ] Server typecheck: `npx tsc --noEmit` — clean.
- [ ] Extension typecheck + build: `cd extension && npm run typecheck && npm run build` — clean.
- [ ] Re-read the spec's **Success criteria** and confirm each is met by the manual verification in Task 12.

## Notes on scope discipline

- **Do not** add multi-step/wizard navigation, "Next"-button driving, or a vision fallback — those are Idea 3 (out of scope; see spec non-goals).
- **Do not** auto-submit under any circumstance.
- The deterministic plan must always be a safe fallback: if the LLM call fails or AI is unconfigured, `planForm` returns the regex-based plan (Task 4, Step 5).
