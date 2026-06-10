import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from "ai";
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
  staleApps: { employerName: string | null; roleTitle: string | null; submittedAt: Date | null }[] = [],
): string {
  const memory = coreFiles.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join("\n");
  const questions = pendingQuestions.length
    ? `\nWhen natural, weave in these pending confirmations (do not interrogate; one at a time):\n${pendingQuestions.map((q) => `- ${q}`).join("\n")}`
    : "";
  const staleNudge = staleApps.length
    ? `\nIf natural, ask whether there's any news on these submitted applications (one at a time, don't interrogate):\n${staleApps
        .map((a) => {
          const date = a.submittedAt ? a.submittedAt.toISOString().slice(0, 10) : "unknown";
          return `- ${a.employerName ?? "Unknown employer"} - ${a.roleTitle ?? "unknown role"} (submitted ${date})`;
        })
        .join("\n")}`
    : "";
  return `You are Cyclops, the user's application copilot for UK finance roles. You know one domain deeply: this user and their applications. You are not a general assistant.

Core memory (always current; treat as your knowledge of the user):
${memory}

Memory rules:
- Update memory with edit_memory whenever the user shares something durable. SUPERSEDE, don't append: contradicted facts move to History with their dates. Never rewrite "Raw notes" sections.
- Confidence discipline: never assert a fact tagged medium or low as flat truth. Say "you've mentioned X (confidence: medium) - right?" and confirm before relying on it. Facts the user states directly are high confidence, dated today.
- If two memories contradict and you cannot resolve it, ask - never keep both.

Style: plain, direct, specific. British English. No em dashes. Use the user's actual stories and facts, never generic filler. Be honest about weak fit; flattery costs the user money and time.${questions}${staleNudge}`;
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

  // Stale-application nudge: up to 3 SUBMITTED apps older than 14 days
  const staleApps = await prisma.application.findMany({
    where: {
      userId: args.userId,
      status: "SUBMITTED",
      submittedAt: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { submittedAt: "asc" },
    take: 3,
    select: { employerName: true, roleTitle: true, submittedAt: true },
  });

  // ignoreIncompleteToolCalls: an aborted tool call persisted mid-execution
  // would otherwise emit a tool-call with no result and poison every
  // subsequent request in this session.
  const history = await convertToModelMessages(args.messages, { ignoreIncompleteToolCalls: true });

  // Anthropic prompt caching: a breakpoint on the system message caches
  // tools + system; one on the last message caches the conversation history.
  // Cached reads cost ~10% and do NOT count toward the input-tokens-per-minute
  // rate limit, which matters because every tool-use step (up to 12 per turn)
  // re-sends the full prefix.
  const cacheBreakpoint = { anthropic: { cacheControl: { type: "ephemeral" as const } } };
  const systemMessage: ModelMessage = {
    role: "system",
    content: buildSystemPrompt(core, pendingQuestions, staleApps),
    providerOptions: cacheBreakpoint,
  };
  const lastMessage = history[history.length - 1];
  if (lastMessage) {
    lastMessage.providerOptions = { ...lastMessage.providerOptions, ...cacheBreakpoint };
  }

  const result = streamText({
    model: sonnet,
    messages: [systemMessage, ...history],
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
