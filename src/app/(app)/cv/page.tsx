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

export default async function CvPage({
  searchParams,
}: {
  // U4b: the dock→CV handoff lands here as ?handoff=<request>&pane=refine. The
  // client auto-sends `handoff` to the CV coach exactly once and strips it.
  searchParams: Promise<{
    handoff?: string | string[];
    pane?: string | string[];
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const sp = await searchParams;
  const handoff = Array.isArray(sp.handoff) ? sp.handoff[0] : sp.handoff;
  const paneParam = Array.isArray(sp.pane) ? sp.pane[0] : sp.pane;
  // Only "refine" opens the coach view; any other/absent value keeps today's
  // default (preview). A handoff implies refine even if the param is missing.
  const initialPane: "preview" | "chat" =
    paneParam === "refine" || handoff ? "chat" : "preview";

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
      handoff={handoff}
      initialPane={initialPane}
    />
  );
}
