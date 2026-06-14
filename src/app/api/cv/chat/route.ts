// src/app/api/cv/chat/route.ts
// Dedicated streaming chat endpoint for the CV-builder chatbot.
// Mirrors /api/chat/route.ts, but uses streamCvBuilder and kind="cv-builder".
import { after } from "next/server";
import { consumeStream } from "ai";
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { streamCvBuilder } from "@/server/ai/cv-brain";
import { checkBudget } from "@/server/ai/budget";
import { syncCvGrounding } from "@/server/cv/grounding";
import type { UIMessage } from "ai";
import { rowToUIMessage } from "@/server/chat/messages";

export const runtime = "nodejs";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Body schema — text-only, mirrors /api/chat
// ---------------------------------------------------------------------------
const TextPartSchema = z.object({ type: z.literal("text"), text: z.string() });

const UIMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  parts: z.array(TextPartSchema).max(8),
});

const CvChatBodySchema = z.object({
  sessionId: z.string().min(1),
  messages: z.array(UIMessageSchema).min(1),
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
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

  const { ok } = await checkBudget(userId);
  if (!ok) {
    return Response.json(
      {
        error:
          "Daily Cyclops limit reached. CV editing still works via the form; generation resets tomorrow.",
      },
      { status: 429 },
    );
  }

  // --- Parse body ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = CvChatBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  // Enforce last message is a user message
  const incomingMessage = body.messages[body.messages.length - 1];
  if (!incomingMessage || incomingMessage.role !== "user") {
    return Response.json(
      { error: "Last message must have role 'user'." },
      { status: 400 },
    );
  }

  // Enforce total text length <= 8000 chars
  const totalTextLength = incomingMessage.parts.reduce(
    (sum, p) => sum + p.text.length,
    0,
  );
  if (totalTextLength > 8000) {
    return Response.json(
      { error: "Message text exceeds 8000 characters." },
      { status: 400 },
    );
  }

  // --- Validate session belongs to user AND is a cv-builder session ---
  const chatSession = await prisma.chatSession.findFirst({
    where: { id: body.sessionId, userId, kind: "cv-builder" },
  });
  if (!chatSession) return new Response("Not found", { status: 404 });

  // --- Rebuild history server-side ---
  const storedHistory = await loadSessionHistory(chatSession.id);
  const serverMessages: UIMessage[] = [
    ...storedHistory,
    incomingMessage as UIMessage,
  ];

  // Persist the user message up front so it survives aborts/disconnects
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
    console.error("[cv-chat] failed to persist user message", {
      sessionId: chatSession.id,
      err,
    });
  }

  // --- Stream ---
  const { result } = await streamCvBuilder({ userId, messages: serverMessages });

  // Schedule grounding sync after the response (best-effort)
  after(async () => {
    await syncCvGrounding(userId);
  });

  // Run the LLM stream to completion server-side even if the client disconnects
  result.consumeStream(); // no await

  return result.toUIMessageStreamResponse({
    originalMessages: serverMessages,
    consumeSseStream: consumeStream,
    onFinish: async ({ responseMessage, isAborted }) => {
      const lastUserMsg = incomingMessage as UIMessage;
      const toSave = [lastUserMsg, responseMessage];

      // Persist chat messages with skipDuplicates
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
        console.error("[cv-chat] failed to persist messages", {
          sessionId: chatSession.id,
          err,
        });
      }

      // Auto-title the session on first user message
      try {
        if (
          chatSession.title === "New conversation" &&
          lastUserMsg?.role === "user"
        ) {
          const textPart = lastUserMsg.parts.find((p) => p.type === "text");
          const title =
            textPart && "text" in textPart
              ? textPart.text.slice(0, 60)
              : "CV Builder";
          await prisma.chatSession.update({
            where: { id: chatSession.id },
            data: { title },
          });
        }
      } catch (err) {
        console.error("[cv-chat] failed to auto-title session", {
          sessionId: chatSession.id,
          err,
        });
      }

      // Touch updatedAt so the session list stays ordered
      try {
        await prisma.chatSession.update({
          where: { id: chatSession.id },
          data: { updatedAt: new Date() },
        });
      } catch (err) {
        console.error("[cv-chat] failed to update session timestamp", {
          sessionId: chatSession.id,
          err,
        });
      }
    },
  });
}
