// src/test/onboarding-distill-feedback.test.ts
//
// U1 Part B — onboarding AI-fail feedback. The voice-distill step fails SILENTLY
// today (returns { ok: false } with nothing for the UI to show). With $0 of
// Anthropic credit this WILL happen in beta. The fix: the failure path must
// surface a friendly, NON-BLOCKING message; the HAPPY path must stay
// byte-identical (still { ok: true } and no message).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1" } })),
}));
vi.mock("@/server/ai/models", () => ({ sonnet: {}, haiku: {} }));

const { checkBudget, recordUsage } = vi.hoisted(() => ({
  checkBudget: vi.fn(async () => ({ ok: true })),
  recordUsage: vi.fn(async () => {}),
}));
vi.mock("@/server/ai/budget", () => ({ checkBudget, recordUsage }));

const { read, write } = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@/server/memory/service", () => ({
  memoryService: { read, write },
}));

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({ generateText, generateObject: vi.fn() }));

import { distillVoice } from "@/app/onboarding/cyclops-actions";
import { ONBOARDING_VOICE_FAIL_MESSAGE } from "@/app/onboarding/messages";

const VALID_VOICE = `# Voice
## Banned tells
- Em dashes
## Observed traits
- Short sentences (confidence: medium, confirmed: 2026-06-21)
## Exemplars
> A real line I wrote.
`;

beforeEach(() => {
  vi.clearAllMocks();
  checkBudget.mockResolvedValue({ ok: true });
  read.mockResolvedValue(null); // no existing voice.md
  write.mockResolvedValue(undefined);
});

describe("distillVoice — happy path stays byte-identical", () => {
  it("returns { ok: true } with NO message when distillation succeeds", async () => {
    generateText.mockResolvedValue({ text: VALID_VOICE, usage: { totalTokens: 10 } });
    const res = await distillVoice(["I wrote this cover letter myself."]);
    expect(res).toEqual({ ok: true });
    expect(res.message).toBeUndefined();
    expect(write).toHaveBeenCalledOnce();
  });

  it("returns { ok: true } with NO message when there is nothing to distill", async () => {
    const res = await distillVoice(["   ", ""]);
    expect(res).toEqual({ ok: true });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns { ok: true } with NO message when the user customised voice.md", async () => {
    read.mockResolvedValue({ content: "# Voice\nmy own custom file" });
    const res = await distillVoice(["a sample"]);
    expect(res).toEqual({ ok: true });
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("distillVoice — failure path now surfaces a friendly message", () => {
  it("returns ok:false + the friendly message when the LLM call throws", async () => {
    generateText.mockRejectedValue(new Error("anthropic 402 no credit"));
    const res = await distillVoice(["a real writing sample"]);
    expect(res.ok).toBe(false);
    expect(res.message).toBe(ONBOARDING_VOICE_FAIL_MESSAGE);
  });

  it("returns ok:false + the friendly message when the budget is exhausted", async () => {
    checkBudget.mockResolvedValue({ ok: false });
    const res = await distillVoice(["a real writing sample"]);
    expect(res.ok).toBe(false);
    expect(res.message).toBe(ONBOARDING_VOICE_FAIL_MESSAGE);
  });

  it("returns ok:false + the friendly message when the memory read throws (fail-closed)", async () => {
    read.mockRejectedValue(new Error("db down"));
    const res = await distillVoice(["a real writing sample"]);
    expect(res.ok).toBe(false);
    expect(res.message).toBe(ONBOARDING_VOICE_FAIL_MESSAGE);
  });

  it("returns ok:false + the friendly message when LLM output fails validation", async () => {
    generateText.mockResolvedValue({ text: "not a voice file", usage: { totalTokens: 5 } });
    const res = await distillVoice(["a real writing sample"]);
    expect(res.ok).toBe(false);
    expect(res.message).toBe(ONBOARDING_VOICE_FAIL_MESSAGE);
    expect(write).not.toHaveBeenCalled();
  });

  it("the friendly message never blames the user and never exposes internals", () => {
    expect(ONBOARDING_VOICE_FAIL_MESSAGE.length).toBeGreaterThan(0);
    const lower = ONBOARDING_VOICE_FAIL_MESSAGE.toLowerCase();
    expect(lower).not.toContain("error");
    expect(lower).not.toContain("402");
    expect(lower).not.toContain("anthropic");
    expect(lower).not.toContain("undefined");
  });
});
