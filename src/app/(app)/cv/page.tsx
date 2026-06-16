// src/app/(app)/cv/page.tsx
// Unified CV page: build (AI draft), revise (Cyclops chat), export. Replaces
// the old /cv-builder and /my-cv pages.
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getBuiltCv, ensureCvChatSession } from "@/server/cv/store";
import { toUIMessages } from "@/server/chat/messages";
import { EMPTY_CV, isCvEmpty } from "@/lib/cv";
import { CvPageClient } from "@/components/cv/cv-page-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "My CV — Cyclops" };

export default async function CvPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const sessionId = await ensureCvChatSession(userId);
  const built = await getBuiltCv(userId);
  const initialCv = built?.cv ?? EMPTY_CV;

  const rows = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 30,
  });
  const initialMessages = toUIMessages(rows);

  return (
    <CvPageClient
      sessionId={sessionId}
      initialMessages={initialMessages}
      initialCv={initialCv}
      initialHasCv={!isCvEmpty(initialCv)}
    />
  );
}
