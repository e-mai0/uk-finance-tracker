"use server";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";

export async function createThread(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const thread = await prisma.chatSession.create({
    data: { userId: session.user.id },
  });
  redirect(`/chat?t=${thread.id}`);
}
