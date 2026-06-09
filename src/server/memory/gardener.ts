import { generateObject } from "ai";
import { z } from "zod";
import { haiku } from "@/server/ai/models";
import type { createMemoryService } from "@/server/memory/service";

type MemoryService = ReturnType<typeof createMemoryService>;

const GardenerResult = z.object({
  proposals: z
    .array(z.object({ path: z.string(), newContent: z.string(), reason: z.string() }))
    .max(5),
  questions: z.array(z.string()).max(3),
});

/**
 * Extracts the text of a "## Raw notes" section (everything between the heading
 * and the next ## heading, or end of file).  Returns null if there is no such
 * section.
 */
function extractRawNotesSection(content: string): string | null {
  const match = content.match(/## Raw notes\n([\s\S]*?)(?=\n## |\n# |$)/);
  return match ? match[0] : null;
}

export async function buildGardenerPrompt(userId: string, svc: MemoryService): Promise<string> {
  const files = await svc.list(userId);
  const tree = files.map((f) => `=== ${f.path} ===\n${f.content}`).join("\n\n");
  return `You are the memory gardener for a job-application assistant.
Scan this user's memory tree for: contradictions, duplicates, stale volatile facts, files grown past ~150 lines.

Rules:
- supersede, don't append: a live file holds ONE current truth per topic; contradicted facts move to the file's History section with their original date.
- never delete or rewrite content under a "Raw notes" heading.
- if you cannot resolve a contradiction confidently, leave the file unchanged and ask a question instead.
- at most 3 short questions, phrased naturally for a chat ("In March you said X - still true?").

Memory tree:
${tree}`;
}

export async function runGardener(
  userId: string,
  svc: MemoryService,
  hooks: {
    saveQuestion: (userId: string, question: string) => Promise<void> | void;
    recordRun: (userId: string) => Promise<void> | void;
  },
): Promise<{ applied: number; questions: string[] }> {
  const prompt = await buildGardenerPrompt(userId, svc);
  const { object } = await generateObject({
    model: haiku,
    schema: GardenerResult,
    prompt,
  });

  let applied = 0;
  for (const p of object.proposals) {
    try {
      // Structural Raw notes guard: if the existing file has a Raw notes
      // section and the proposal's newContent does not contain that section's
      // exact text, skip the proposal entirely.
      const existing = await svc.read(userId, p.path);
      if (existing) {
        const rawNotesSection = extractRawNotesSection(existing.content);
        if (rawNotesSection !== null && !p.newContent.includes(rawNotesSection)) {
          // Proposal would clobber user-owned Raw notes — skip it.
          continue;
        }
      }
      await svc.write(userId, p.path, p.newContent, "CYCLOPS", `gardener: ${p.reason}`);
      applied++;
    } catch {
      // Per-proposal errors (e.g. invalid path) must not abort the rest.
    }
  }

  for (const q of object.questions) {
    await hooks.saveQuestion(userId, q);
  }
  await hooks.recordRun(userId);
  return { applied, questions: object.questions };
}

/** Production hooks backed by Prisma. */
export async function runGardenerForUser(userId: string): Promise<void> {
  const { prisma } = await import("@/server/db");
  const { memoryService } = await import("@/server/memory/service");
  await runGardener(userId, memoryService, {
    saveQuestion: async (uid, question) => {
      await prisma.gardenerQuestion.create({ data: { userId: uid, question } });
    },
    recordRun: async (uid) => {
      await prisma.gardenerRun.create({ data: { userId: uid } });
    },
  });
}

/** True when 10+ CYCLOPS revisions have accumulated since the last run. */
export async function gardenerDue(userId: string): Promise<boolean> {
  const { prisma } = await import("@/server/db");
  const lastRun = await prisma.gardenerRun.findFirst({
    where: { userId },
    orderBy: { ranAt: "desc" },
  });
  const count = await prisma.memoryRevision.count({
    where: {
      author: "CYCLOPS",
      createdAt: { gt: lastRun?.ranAt ?? new Date(0) },
      file: { userId },
    },
  });
  return count >= 10;
}
