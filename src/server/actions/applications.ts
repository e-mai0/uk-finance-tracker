"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db";

const STATUSES = [
  "DRAFT",
  "AUTOFILLED",
  "SUBMITTED",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;
type Status = (typeof STATUSES)[number];

export async function updateApplicationStatus(
  id: string,
  status: string,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };
  if (!STATUSES.includes(status as Status)) return { error: "Invalid status." };

  await prisma.application.updateMany({
    where: { id, userId: session.user.id },
    data: {
      status: status as Status,
      submittedAt: status === "SUBMITTED" ? new Date() : undefined,
    },
  });
  revalidatePath("/applications");
  return { ok: true };
}

export async function deleteApplication(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };

  await prisma.application.deleteMany({ where: { id, userId: session.user.id } });
  revalidatePath("/applications");
  return { ok: true };
}
