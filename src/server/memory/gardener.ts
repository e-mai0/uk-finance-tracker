import { generateObject } from "ai";
import { z } from "zod";
import { modelFor } from "@/server/ai/models";
import type { createMemoryService } from "@/server/memory/service";

type MemoryService = ReturnType<typeof createMemoryService>;

const GardenerResult = z.object({
  proposals: z
    .array(z.object({ path: z.string(), newContent: z.string(), reason: z.string() }))
    .max(5),
  questions: z.array(z.string()).max(3),
});

/**
 * Normalizes line endings and extracts ALL "## Raw notes" sections
 * (case-insensitive) from the content.  A section runs from its heading
 * to the next `## ` heading or EOF.
 * Returns an array of normalized section strings (heading + body).
 */
function extractAllRawNotesSections(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const sections: string[] = [];

  // Split into lines and find every line matching `## raw notes` (case-insensitive)
  const lines = normalized.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+raw notes\s*$/i.test(lines[i])) {
      // Collect from this heading to just before the next ## heading or EOF
      let j = i + 1;
      while (j < lines.length && !/^##\s/.test(lines[j])) {
        j++;
      }
      sections.push(lines.slice(i, j).join("\n"));
    }
  }

  return sections;
}

/**
 * Checks whether the proposal's newContent (after CRLF normalization) preserves
 * every Raw notes section that exists in the existing content.
 * Returns true when the proposal is safe (no raw-notes sections, or all present).
 * Returns false when the proposal would clobber at least one raw-notes section.
 */
export function rawNotesGuardPasses(existingContent: string, proposedContent: string): boolean {
  const sections = extractAllRawNotesSections(existingContent);
  if (sections.length === 0) return true;

  const normalizedProposal = proposedContent.replace(/\r\n/g, "\n");
  for (const section of sections) {
    if (!normalizedProposal.includes(section)) {
      return false;
    }
  }
  return true;
}

const MAX_FILE_CHARS = 6000;
const MAX_TREE_CHARS = 60000;

export async function buildGardenerPrompt(userId: string, svc: MemoryService): Promise<string> {
  const files = await svc.list(userId);

  let tree = "";
  let treeChars = 0;

  for (const f of files) {
    let content = f.content;
    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS) + "\n[truncated]";
    }
    const entry = `=== ${f.path} ===\n${content}`;
    if (treeChars + entry.length > MAX_TREE_CHARS) {
      console.warn("gardener: prompt tree budget exceeded, stopping at", f.path);
      break;
    }
    tree += (tree ? "\n\n" : "") + entry;
    treeChars += entry.length;
  }

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
    recordUsage?: (userId: string, tokens: number) => Promise<void> | void;
  },
  existingQuestions?: string[],
): Promise<{ applied: number; skipped: number; questions: string[] }> {
  let applied = 0;
  let skipped = 0;
  let filteredQuestions: string[] = [];

  try {
    const prompt = await buildGardenerPrompt(userId, svc);
    const { object, usage } = await generateObject({
      model: modelFor("gardener"),
      schema: GardenerResult,
      prompt,
      maxOutputTokens: 8000,
    });
    if (hooks.recordUsage) {
      await hooks.recordUsage(userId, usage?.totalTokens ?? 0);
    }

    for (const p of object.proposals) {
      try {
        // Item 2: Restrict proposals to existing paths — gardener consolidates,
        // it must not mint new files.
        const existing = await svc.read(userId, p.path);
        if (!existing) {
          console.warn("gardener: skipping proposal for non-existent path", p.path);
          skipped++;
          continue;
        }

        // Item 1: Fail-closed raw-notes guard: handles CRLF, case, multiple sections.
        if (!rawNotesGuardPasses(existing.content, p.newContent)) {
          console.warn("gardener: skipping proposal that would clobber raw notes", p.path);
          skipped++;
          continue;
        }

        await svc.write(userId, p.path, p.newContent, "CYCLOPS", `gardener: ${p.reason}`);
        applied++;
      } catch (err) {
        // Item 3: Per-proposal errors must not abort the rest; log them.
        console.error("gardener: proposal failed", p.path, err);
      }
    }

    // Item 7: Question dedup — filter out questions that case-insensitively
    // match an already-pending question.
    const existingLower = (existingQuestions ?? []).map((q) => q.toLowerCase());
    filteredQuestions = object.questions.filter(
      (q) => !existingLower.includes(q.toLowerCase()),
    );

    for (const q of filteredQuestions) {
      await hooks.saveQuestion(userId, q);
    }
  } catch (err) {
    console.error("gardener: run failed", userId, err);
    // Fall through to finally — recordRun still executes.
  } finally {
    // Item 5: recordRun always executes, even when generateObject throws.
    await hooks.recordRun(userId);
  }

  return { applied, skipped, questions: filteredQuestions };
}

/** Production hooks backed by Prisma. */
export async function runGardenerForUser(userId: string): Promise<void> {
  const { prisma } = await import("@/server/db");
  const { memoryService } = await import("@/server/memory/service");

  // Item 7: Load pending gardener questions so duplicates can be filtered.
  const pendingRows = await prisma.gardenerQuestion.findMany({
    where: { userId, status: { in: ["pending", "asked"] } },
    select: { question: true },
  });
  const existingQuestions = pendingRows.map((r) => r.question);

  const result = await runGardener(
    userId,
    memoryService,
    {
      saveQuestion: async (uid, question) => {
        await prisma.gardenerQuestion.create({ data: { userId: uid, question } });
      },
      recordRun: async (uid) => {
        await prisma.gardenerRun.create({ data: { userId: uid } });
      },
      recordUsage: async (uid, tokens) => {
        if (tokens > 0) {
          const { recordUsage } = await import("@/server/ai/budget");
          await recordUsage(uid, tokens).catch(() => {});
        }
      },
    },
    existingQuestions,
  );

  // Item 3: Log result summary.
  console.info("gardener: run complete", { userId, ...result });
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
