"use server";

import type { UIMessage } from "ai";
import { auth } from "../auth";
import { prisma } from "../db";
import { toUIMessages } from "@/server/chat/messages";
import { DOCK_THREAD_TITLE } from "@/lib/dock-context";

/**
 * Find (or lazily create) the per-user persistent "Dock" ChatSession and
 * return its last 30 messages, oldest-first, ready for CyclopsChat.
 */
export async function getOrCreateDockThread(): Promise<
  { sessionId: string; messages: UIMessage[] } | { error: string }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Your session has expired. Sign in again." };
  }
  const userId = session.user.id;

  let thread = await prisma.chatSession.findFirst({
    where: { userId, title: DOCK_THREAD_TITLE },
    orderBy: { updatedAt: "desc" },
  });
  if (!thread) {
    thread = await prisma.chatSession.create({
      data: { userId, title: DOCK_THREAD_TITLE },
    });
  }

  // Last 30 messages, returned oldest-first (same shape as the chat page).
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId: thread.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  rows.reverse();

  return { sessionId: thread.id, messages: toUIMessages(rows) };
}
