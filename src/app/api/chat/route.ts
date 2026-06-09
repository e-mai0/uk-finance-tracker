import { after } from "next/server";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { streamCyclops } from "@/server/ai/brain";
import { checkBudget, recordUsage } from "@/server/ai/budget";
import { gardenerDue, runGardenerForUser } from "@/server/memory/gardener";
import type { UIMessage } from "ai";

export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

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

  const body = (await req.json()) as { messages: UIMessage[]; sessionId: string };

  const chatSession = await prisma.chatSession.findFirst({
    where: { id: body.sessionId, userId },
  });
  if (!chatSession) return new Response("Not found", { status: 404 });

  const result = await streamCyclops({ userId, messages: body.messages });

  // Schedule the gardener check at route-handler level while still inside the
  // request's async context. after() reads workAsyncStorage synchronously, so
  // calling it inside the SDK's onFinish callback (which fires after the stream
  // has closed) would throw "after was called outside a request scope".
  after(async () => {
    try {
      if (await gardenerDue(userId)) {
        await runGardenerForUser(userId);
      }
    } catch (err) {
      console.error("gardener trigger failed", err);
    }
  });

  return result.toUIMessageStreamResponse({
    // Passing originalMessages enables persistence mode: the SDK tracks
    // the full updated list in onFinish({ messages }).
    originalMessages: body.messages,
    onFinish: async ({ responseMessage }) => {
      // Save only the latest user message + the new assistant response —
      // previous turns are already persisted in the DB from prior requests.
      const lastUserMsg = body.messages[body.messages.length - 1];
      const toSave = lastUserMsg ? [lastUserMsg, responseMessage] : [responseMessage];

      // 1. Persist chat messages — most important, run first.
      try {
        await prisma.chatMessage.createMany({
          data: toSave.map((m) => ({
            sessionId: chatSession.id,
            role: m.role,
            parts: JSON.stringify(m.parts),
          })),
        });
      } catch (err) {
        console.error("[chat] failed to persist messages", { sessionId: chatSession.id, err });
      }

      // 2. Record token usage.
      try {
        const usage = await result.totalUsage;
        await recordUsage(userId, usage?.totalTokens ?? 0);
      } catch (err) {
        console.error("[chat] failed to record usage", { userId, err });
      }

      // 3. Auto-title the session on first user message.
      try {
        if (chatSession.title === "New conversation" && lastUserMsg?.role === "user") {
          const textPart = lastUserMsg.parts.find((p) => p.type === "text");
          const title =
            textPart && "text" in textPart ? textPart.text.slice(0, 60) : "Conversation";
          await prisma.chatSession.update({
            where: { id: chatSession.id },
            data: { title },
          });
        }
      } catch (err) {
        console.error("[chat] failed to auto-title session", { sessionId: chatSession.id, err });
      }

      // 4. Touch updatedAt so the session list stays ordered.
      try {
        await prisma.chatSession.update({
          where: { id: chatSession.id },
          data: { updatedAt: new Date() },
        });
      } catch (err) {
        console.error("[chat] failed to update session timestamp", { sessionId: chatSession.id, err });
      }
    },
  });
}
