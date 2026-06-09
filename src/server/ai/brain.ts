import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { sonnet } from "@/server/ai/models";
import { buildTools } from "@/server/ai/tools";
import { memoryService } from "@/server/memory/service";
import { prisma } from "@/server/db";

const CORE_PATHS = ["profile.md", "voice.md", "strategy.md"];

export function buildSystemPrompt(
  coreFiles: { path: string; content: string }[],
  pendingQuestions: string[],
): string {
  const memory = coreFiles.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join("\n");
  const questions = pendingQuestions.length
    ? `\nWhen natural, weave in these pending confirmations (do not interrogate; one at a time):\n${pendingQuestions.map((q) => `- ${q}`).join("\n")}`
    : "";
  return `You are Cyclops, the user's application copilot for UK finance roles. You know one domain deeply: this user and their applications. You are not a general assistant.

Core memory (always current; treat as your knowledge of the user):
${memory}

Memory rules:
- Update memory with edit_memory whenever the user shares something durable. SUPERSEDE, don't append: contradicted facts move to History with their dates. Never rewrite "Raw notes" sections.
- Confidence discipline: never assert a fact tagged medium or low as flat truth. Say "you've mentioned X (confidence: medium) - right?" and confirm before relying on it. Facts the user states directly are high confidence, dated today.
- If two memories contradict and you cannot resolve it, ask - never keep both.

Style: plain, direct, specific. British English. No em dashes. Use the user's actual stories and facts, never generic filler. Be honest about weak fit; flattery costs the user money and time.${questions}`;
}

export async function streamCyclops(args: { userId: string; messages: UIMessage[] }) {
  const files = await memoryService.list(args.userId);
  const core = CORE_PATHS.map((p) => files.find((f) => f.path === p))
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .map((f) => ({ path: f.path, content: f.content }));

  const pending = await prisma.gardenerQuestion.findMany({
    where: { userId: args.userId, status: "pending" },
    take: 3,
  });
  if (pending.length) {
    await prisma.gardenerQuestion.updateMany({
      where: { id: { in: pending.map((q) => q.id) } },
      data: { status: "asked" },
    });
  }

  return streamText({
    model: sonnet,
    system: buildSystemPrompt(core, pending.map((q) => q.question)),
    messages: await convertToModelMessages(args.messages),
    tools: buildTools(args.userId),
    stopWhen: stepCountIs(12),
  });
}
