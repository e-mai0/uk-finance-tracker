// src/app/(app)/cv-builder/page.tsx
// CV Builder page. Server component: ensures a BuiltCv row + dedicated chat
// session exist, loads the current CV and chat history, then renders the
// client CvBuilderClient (form + chat + live preview).
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getBuiltCv, ensureCvChatSession } from "@/server/cv/store";
import { toUIMessages } from "@/server/chat/messages";
import { EMPTY_CV } from "@/lib/cv";
import { CvBuilderClient } from "@/components/cv/cv-builder-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "CV Builder — Cyclops" };

export default async function CvBuilderPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Ensure the BuiltCv row exists (created lazily) and get/create the chat session.
  const sessionId = await ensureCvChatSession(userId);

  // Load the current CV (or start with an empty one).
  const built = await getBuiltCv(userId);
  const initialCv = built?.cv ?? EMPTY_CV;
  const initialFormInput = built?.formInput ?? null;

  // Load the last 30 messages from the cv-builder chat thread.
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 30,
  });
  const initialMessages = toUIMessages(rows);

  return (
    <CvBuilderClient
      sessionId={sessionId}
      initialMessages={initialMessages}
      initialCv={initialCv}
      initialFormInput={initialFormInput}
    />
  );
}
