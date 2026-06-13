// src/app/(app)/cv-builder/page.tsx
// Server component: ensures BuiltCv row + cv-builder chat session, loads data,
// then renders the client CvBuilderShell.
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getBuiltCv, ensureCvChatSession } from "@/server/cv/store";
import { toUIMessages } from "@/server/chat/messages";
import { prisma } from "@/server/db";
import { CvBuilderShell } from "@/components/cv/cv-builder-shell";
import { EMPTY_CV } from "@/lib/cv";

export const dynamic = "force-dynamic";
export const metadata = { title: "CV Builder — Cyclops" };

export default async function CvBuilderPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id;

  // Ensure a cv-builder chat session exists and is linked to BuiltCv
  const chatSessionId = await ensureCvChatSession(userId);

  // Load current CV data and chat history
  const [built, chatMessages] = await Promise.all([
    getBuiltCv(userId),
    prisma.chatMessage.findMany({
      where: { sessionId: chatSessionId },
      orderBy: { createdAt: "asc" },
      take: 60,
    }),
  ]);

  const initialCv = built?.cv ?? EMPTY_CV;
  const initialMessages = toUIMessages(chatMessages);

  return (
    <CvBuilderShell
      initialCv={initialCv}
      sessionId={chatSessionId}
      initialMessages={initialMessages}
    />
  );
}
