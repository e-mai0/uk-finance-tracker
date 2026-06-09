import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { sonnet } from "@/server/ai/models";
import { buildTools } from "@/server/ai/tools";
import { memoryService } from "@/server/memory/service";
import { annotateDecay } from "@/server/memory/facts";
import { recordUsage } from "@/server/ai/budget";
import { prisma } from "@/server/db";

const CORE_PATHS = ["profile.md", "voice.md", "strategy.md"];
const MAX_CORE_CHARS = 6000;

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

/** Load the 3 oldest pending gardener questions for this user. Does NOT mark them asked. */
export async function loadPendingQuestions(userId: string): Promise<{ id: string; question: string }[]> {
  return prisma.gardenerQuestion.findMany({
    where: { userId, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 3,
    select: { id: true, question: true },
  });
}

export async function streamCyclops(args: { userId: string; messages: UIMessage[] }) {
  const files = await memoryService.list(args.userId);
  const now = new Date();

  const core = CORE_PATHS.map((p) => files.find((f) => f.path === p))
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .map((f) => {
      // Item 2: annotate decay and cap at MAX_CORE_CHARS
      let content = annotateDecay(f.path, f.content, now);
      if (content.length > MAX_CORE_CHARS) {
        content = content.slice(0, MAX_CORE_CHARS) + "\n[truncated]";
      }
      return { path: f.path, content };
    });

  // Item 4: fetch pending questions but DO NOT mark them asked here
  const pendingRows = await loadPendingQuestions(args.userId);
  const pendingQuestions = pendingRows.map((r) => r.question);

  const result = streamText({
    model: sonnet,
    system: buildSystemPrompt(core, pendingQuestions),
    // ignoreIncompleteToolCalls: an aborted tool call persisted mid-execution
    // would otherwise emit a tool-call with no result and poison every
    // subsequent request in this session.
    messages: await convertToModelMessages(args.messages, { ignoreIncompleteToolCalls: true }),
    tools: buildTools(args.userId),
    stopWhen: stepCountIs(12),
    // Item 5: per-step budget recording (fire-and-forget)
    onStepFinish: (step) => {
      const tokens = step.usage?.totalTokens ?? 0;
      if (tokens > 0) {
        recordUsage(args.userId, tokens).catch((err) =>
          console.error("[cyclops] failed to record step usage", { userId: args.userId, err }),
        );
      }
    },
  });

  return { result, pendingQuestions: pendingRows };
}
