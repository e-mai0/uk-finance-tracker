import { after } from "next/server";
import { consumeStream, generateId, JsonToSseTransformStream, createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from "ai";
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { streamCyclops } from "@/server/ai/brain";
import { checkBudget } from "@/server/ai/budget";
import { gardenerDue, runGardenerForUser } from "@/server/memory/gardener";
import type { UIMessage } from "ai";
import { rowToUIMessage } from "@/server/chat/messages";
import {
  getStreamContext,
  setActiveStream,
  clearActiveStream,
} from "@/server/ai/resumable";
import { enforceChatLimit } from "@/server/ratelimit";

export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Zod schema for the POST body (item 1)
// ---------------------------------------------------------------------------
const TextPartSchema = z.object({ type: z.literal("text"), text: z.string() });

const UIMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  parts: z.array(TextPartSchema).max(8),
});

const ChatBodySchema = z.object({
  sessionId: z.string().min(1),
  messages: z.array(UIMessageSchema).min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load the last 30 persisted ChatMessages for a session as UIMessages. */
async function loadSessionHistory(sessionId: string): Promise<UIMessage[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  rows.reverse();
  return rows.map(rowToUIMessage);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // Abuse rate-limit (request-flood guard), keyed per user. Complementary to
  // the daily token budget below — placed after auth (need the identity) but
  // before any expensive AI work or DB writes. Fails open if Redis is down.
  const limited = await enforceChatLimit(userId);
  if (limited) return limited;

  const { ok } = await checkBudget(userId);
  if (!ok) {
    return Response.json(
      {
        error:
          "Daily Cyclops limit reached. Autofill and saved answers still work; generation resets tomorrow.",
      },
      { status: 429 },
    );
  }

  // --- Parse + validate body (item 1) ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = ChatBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  // Extract the last message and enforce it is a user message (item 1)
  const incomingMessage = body.messages[body.messages.length - 1];
  if (!incomingMessage || incomingMessage.role !== "user") {
    return Response.json(
      { error: "Last message must have role 'user'." },
      { status: 400 },
    );
  }

  // Enforce total text length <= 8000 chars across all text parts (item 1)
  const totalTextLength = incomingMessage.parts.reduce((sum, p) => sum + p.text.length, 0);
  if (totalTextLength > 8000) {
    return Response.json(
      { error: "Message text exceeds 8000 characters." },
      { status: 400 },
    );
  }

  // --- Validate session ownership ---
  const chatSession = await prisma.chatSession.findFirst({
    where: { id: body.sessionId, userId, kind: "cyclops" },
  });
  if (!chatSession) return new Response("Not found", { status: 404 });

  // --- Rebuild history server-side (item 1) ---
  const storedHistory = await loadSessionHistory(chatSession.id);
  const serverMessages: UIMessage[] = [...storedHistory, incomingMessage as UIMessage];

  // Persist the user message up front so it survives aborts/disconnects;
  // the onFinish createMany below skipDuplicates this row via (sessionId, clientId).
  try {
    await prisma.chatMessage.createMany({
      data: [
        {
          sessionId: chatSession.id,
          clientId: incomingMessage.id ?? null,
          role: incomingMessage.role,
          parts: JSON.stringify(incomingMessage.parts),
          aborted: false,
        },
      ],
      skipDuplicates: true,
    });
  } catch (err) {
    console.error("[chat] failed to persist user message", { sessionId: chatSession.id, err });
  }

  // --- Stream ---
  const { result, pendingQuestions } = await streamCyclops({ userId, messages: serverMessages });

  // Schedule gardener inside request scope
  after(async () => {
    try {
      if (await gardenerDue(userId)) {
        await runGardenerForUser(userId);
      }
    } catch (err) {
      console.error("gardener trigger failed", err);
    }
  });

  // Run the LLM stream to completion server-side even if the client
  // disconnects, so onFinish still fires and the assistant message persists.
  result.consumeStream(); // no await

  const onFinish = async ({
    responseMessage,
    isAborted,
  }: {
    responseMessage: UIMessage;
    isAborted: boolean;
  }) => {
    const lastUserMsg = incomingMessage as UIMessage;
    const toSave = [lastUserMsg, responseMessage];

    // 1. Persist chat messages with clientId + skipDuplicates
    try {
      await prisma.chatMessage.createMany({
        data: toSave.map((m) => ({
          sessionId: chatSession.id,
          clientId: m.id ?? null,
          role: m.role,
          parts: JSON.stringify(m.parts),
          aborted: m === responseMessage ? isAborted : false,
        })),
        skipDuplicates: true,
      });
    } catch (err) {
      console.error("[chat] failed to persist messages", { sessionId: chatSession.id, err });
    }

    // 2. Mark gardener questions asked if the assistant echoed a distinctive chunk
    try {
      if (pendingQuestions.length > 0) {
        const assistantText = responseMessage.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" ")
          .toLowerCase();
        const toMarkAsked = pendingQuestions
          .filter((q) => {
            const chunk = q.question.trim().slice(0, 25).toLowerCase();
            return chunk.length > 0 && assistantText.includes(chunk);
          })
          .map((q) => q.id);
        if (toMarkAsked.length > 0) {
          await prisma.gardenerQuestion.updateMany({
            where: { id: { in: toMarkAsked } },
            data: { status: "asked" },
          });
        }
      }
    } catch (err) {
      console.error("[chat] failed to mark questions asked", { userId, err });
    }

    // 3. Auto-title the session on first user message
    try {
      if (chatSession.title === "New conversation" && lastUserMsg?.role === "user") {
        const textPart = lastUserMsg.parts.find((p) => p.type === "text");
        const title = textPart && "text" in textPart ? textPart.text.slice(0, 60) : "Conversation";
        await prisma.chatSession.update({ where: { id: chatSession.id }, data: { title } });
      }
    } catch (err) {
      console.error("[chat] failed to auto-title session", { sessionId: chatSession.id, err });
    }

    // 4. Touch updatedAt so the session list stays ordered
    try {
      await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });
    } catch (err) {
      console.error("[chat] failed to update session timestamp", { sessionId: chatSession.id, err });
    }

    // 5. Stream is done — drop the resume pointer so GET returns 204 hereafter.
    await clearActiveStream(chatSession.id);
  };

  const uiStream = result.toUIMessageStream({
    originalMessages: serverMessages,
    onFinish,
  });

  // Without Redis, behave exactly as before: stream straight to the client.
  const streamContext = getStreamContext();
  if (!streamContext) {
    return createUIMessageStreamResponse({ stream: uiStream, consumeSseStream: consumeStream });
  }

  // With Redis: register a resumable stream and record the session pointer so a
  // remount (e.g. opening another session and coming back) can reattach.
  const streamId = generateId();
  const pointerStored = await setActiveStream(chatSession.id, streamId);
  if (!pointerStored) {
    return createUIMessageStreamResponse({ stream: uiStream, consumeSseStream: consumeStream });
  }

  try {
    const sseStream = uiStream.pipeThrough(new JsonToSseTransformStream());
    const resumable = await streamContext.resumableStream(streamId, () => sseStream);
    return new Response(resumable ?? sseStream, {
      headers: UI_MESSAGE_STREAM_HEADERS,
    });
  } catch (err) {
    console.error("[chat] failed to create resumable stream; falling back", {
      sessionId: chatSession.id,
      err,
    });
    await clearActiveStream(chatSession.id);
    return createUIMessageStreamResponse({ stream: uiStream, consumeSseStream: consumeStream });
  }
}
