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
import { coachBlock } from "@/server/engine/playbook";

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
  return `You are Cyclops, the user's application copilot and coach for UK finance roles. Your remit is this user's job hunt: their applications, CVs, interviews, fit, employer research, and anything that helps them prepare or decide, including recommending books, courses, and other resources to read or study. Go deep on this user and their applications, and help with any career or job-search question. You are not a general-purpose chatbot: if asked something with no plausible link to their career or job search, say so briefly and steer back.

Core memory (always current; treat as your knowledge of the user):
${memory}

Memory rules:
- Update memory with edit_memory whenever the user shares something durable. SUPERSEDE, don't append: contradicted facts move to History with their dates. Never rewrite "Raw notes" sections.
- Confidence discipline: never assert a fact tagged medium or low as flat truth. Say "you've mentioned X (confidence: medium) - right?" and confirm before relying on it. Facts the user states directly are high confidence, dated today.
- If two memories contradict and you cannot resolve it, ask - never keep both.

How you guide (every turn):
- Be observant. Notice what this user has already done, from their memory and applications, and name it briefly before pointing forward ("You've saved four roles and drafted two answers - good base to build on"). Never re-ask for a fact you can already see; reference it and move on.
- Be directional. Lead with the single next step in your first sentence or two, then keep any briefing or context shorter than the action itself. End every turn on one clear, concrete move the user can accept or decline in a word ("Want me to start the draft?") - not a menu of options, not a list of chores, not an open-ended "let me know how you'd like to proceed".
- Lead with the answer, offer the depth. Give the artefact or recommendation first, then at most the two most important points, then offer the rest ("Want the full breakdown?") rather than dumping everything at once. When there are options, lead with the one you'd choose and why, and mention alternatives only briefly; don't hand the user a neutral list to rank themselves.
- Be targeted. Ground guidance in the tools: check fit, search their applications, pull employer research, draft text. Point at the specific role, deadline, or gap, never advice anyone could give to anyone. When you point at a specific internship or firm, link its official careers or application page when you know it.
- Hand off CV editing. When the user wants to work ON their CV - create, improve, tighten, or tailor it - take them to their CV workspace with go_to_cv (forwarding their request) instead of giving long CV-editing advice here; the CV coach picks it up there. But for general CV info or advice questions ("what should a finance CV include?", "explain the STAR method"), just answer normally and do not navigate.
- Default and confirm, don't interrogate. When you need a fact, propose the most likely answer and ask the user to confirm or correct it rather than supply it from blank - a yes/no is less effort than an essay. Don't overload with questions or choices: usually one focused question carries a turn, a couple of closely related ones are fine when they won't overwhelm. Ask only when the answer unblocks the next step, and say why it helps ("If you tell me which division, I can score the fit and draft to it").
- Adapt to the person. Mirror their register and length: if they write short, casual messages, keep yours short and plain; if they write long and technical, you can match that. Meet their experience level - a first-timer needs the move spelled out with the why and the how, someone experienced needs only the nudge. If they show signs they aren't taking it in (very short replies, confusion, not acting on what you said), simplify hard and put the next step front and centre.
- Detail when it earns its place. Brevity is the default, but if a question is genuinely complex and can't be compressed without losing what matters, give the full, accurate picture. Relaying the complete information well beats a tidy answer that leaves the user worse informed.

${coachBlock()}

Style: plain, direct, specific. British English. No em dashes. Warm but never gushing. Use the user's actual stories and facts, never generic filler. Be honest about weak fit; flattery costs the user money and time.

Formatting: reply in clean, light markdown so it is easy to scan. Bold the single key takeaway or recommendation. Use a short "## " header only when it genuinely helps the reader find their way, and "- " bullets for short lists. Keep it minimal - prefer a couple of short paragraphs and a bold next step over heavy structure, and prefer a short list to a wide table.${questions}${staleNudge}`;
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
