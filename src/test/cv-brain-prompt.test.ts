// src/test/cv-brain-prompt.test.ts
// Guards that the CV-builder coach's system prompt treats ACTIVITIES
// (extracurriculars / positions of responsibility / societies / volunteering /
// competitions) as a first-class section it suggests bullet points for — the
// same way it does experience and projects. Mirrors brain-prompt.test.ts.
import { describe, expect, it, vi } from "vitest";

// Mock heavy server-side deps so importing cv-brain doesn't pull in the
// Anthropic provider, prisma, or the memory service. buildCvSystemPrompt is a
// pure string builder, so stubs are enough to load the module.
vi.mock("ai", () => ({
  streamText: vi.fn(),
  convertToModelMessages: vi.fn(),
  stepCountIs: vi.fn(),
}));
vi.mock("@/server/ai/models", () => ({ sonnet: {} }));
vi.mock("@/server/ai/cv-tools", () => ({ buildCvTools: vi.fn(() => ({})) }));
vi.mock("@/server/ai/budget", () => ({ recordUsage: vi.fn() }));
vi.mock("@/server/cv/store", () => ({ getBuiltCv: vi.fn() }));
vi.mock("@/server/cv/known-profile", () => ({
  gatherKnownProfile: vi.fn(),
  toPromptBlock: vi.fn(() => ""),
}));

import { buildCvSystemPrompt } from "@/server/ai/cv-brain";

describe("CV builder system prompt — activities", () => {
  const cvJson = JSON.stringify({ fullName: "Alex Hartley" }, null, 2);

  it("treats activities as a first-class section to suggest bullet points for", () => {
    const p = buildCvSystemPrompt(cvJson, "").toLowerCase();
    expect(p).toContain("activities");
    expect(p).toContain("first-class");
    // It must talk about suggesting/sharpening bullets for them.
    expect(p).toContain("bullet");
  });

  it("lists activities among the priority gaps it proactively works on", () => {
    const p = buildCvSystemPrompt(cvJson, "").toLowerCase();
    expect(p).toMatch(/priority gaps:[^\n]*activit/);
  });

  it("tells the coach where activities live in the data model (a sections entry)", () => {
    const p = buildCvSystemPrompt(cvJson, "");
    expect(p).toContain("sections");
    expect(p).toContain("Activities");
  });

  it("preserves the existing CV embed and core style rules", () => {
    const p = buildCvSystemPrompt(cvJson, "");
    expect(p).toContain("Alex Hartley");
    expect(p).toContain("British English");
    expect(p).toContain("update_cv");
  });
});
