// src/app/api/chat/[sessionId]/stream/route.ts
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getActiveStream, getStreamContext } from "@/server/ai/resumable";
import { resolveResumeDecision } from "@/server/chat/resume-decision";

export const maxDuration = 120;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  const chatSession = userId
    ? await prisma.chatSession.findFirst({
        where: { id: sessionId, userId, kind: "cyclops" },
        select: { id: true },
      })
    : null;

  const activeStreamId = userId ? await getActiveStream(sessionId) : null;

  const decision = resolveResumeDecision({ userId, session: chatSession, activeStreamId });
  if (decision.status !== 200) {
    return new Response(decision.status === 401 ? "Unauthorized" : null, { status: decision.status });
  }

  // Pointer says a stream is active; ask the context to resume it. If the
  // buffer is already gone (completed/expired between read and resume), 204 so
  // the client falls back to its loaded messages.
  const ctx = getStreamContext();
  // resumeExistingStream returns null (done/expired) or undefined (no stream found) — both map to 204
  const resumed = ctx ? await ctx.resumeExistingStream(decision.streamId) : null;
  if (!resumed) return new Response(null, { status: 204 });

  return new Response(resumed, {
    headers: UI_MESSAGE_STREAM_HEADERS,
  });
}
