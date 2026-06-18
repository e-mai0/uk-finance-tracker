import { describe, expect, it, vi } from "vitest";

// edit_memory only needs its description; mock everything its module imports so
// buildTools() runs without a DB or AI runtime.
vi.mock("@/server/memory/service", () => ({ memoryService: {} }));
vi.mock("@/server/memory/facts", () => ({ annotateDecay: vi.fn() }));
vi.mock("@/server/memory/gardener", () => ({ rawNotesGuardPasses: vi.fn() }));
vi.mock("@/server/ai/tool-guards", () => ({
  isAllowedMemoryPath: vi.fn(),
  stripDecayAnnotations: vi.fn(),
  normalizeReasons: vi.fn(),
}));
vi.mock("@/server/ai/embed", () => ({ semanticSearch: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@prisma/client", () => ({ OpportunityStatus: { CLOSED: "CLOSED" } }));
vi.mock("@/server/engine/research", () => ({ ensureEmployerResearch: vi.fn() }));
vi.mock("@/server/engine/substance", () => ({ gatherSubstance: vi.fn() }));
vi.mock("@/server/engine/draft", () => ({ draftText: vi.fn() }));
vi.mock("@/server/engine/outcomes", () => ({ distillOutcomesForUser: vi.fn() }));
vi.mock("@/ingestion/import", () => ({ slugify: vi.fn() }));

import { buildTools } from "@/server/ai/tools";

function editMemoryDescription(): string {
  const tools = buildTools("user-1") as Record<string, { description?: string }>;
  return tools.edit_memory.description ?? "";
}

describe("edit_memory extraction guidance", () => {
  const desc = editMemoryDescription().toLowerCase();

  it("preserves the existing memory-discipline guidance", () => {
    expect(desc).toContain("supersede");
    expect(desc).toContain("raw notes");
    expect(desc).toContain("decayed to");
    expect(desc).toContain("reason");
  });

  it("guides capture of application-relevant durable facts", () => {
    // target firms / divisions
    expect(desc).toMatch(/firm|division|programme|program/);
    // stories with quantified results
    expect(desc).toContain("stor");
    expect(desc).toMatch(/quantif|number|result/);
    // constraints (work auth, location, timing)
    expect(desc).toMatch(/work auth|visa|sponsorship|constraint|location|timing/);
    // deadlines
    expect(desc).toContain("deadline");
  });
});
