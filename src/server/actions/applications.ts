"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "../auth";
import { prisma } from "../db";
import { distillOutcomesForUser } from "@/server/engine/outcomes";

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
  // Distill outcomes into story signals + strategy observations after the response.
  const userId = session.user.id;
  after(() => distillOutcomesForUser(userId));
  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  return { ok: true };
}

/** Form-action wrapper: a `<form action>` can't consume the {ok/error} return. */
export async function updateApplicationStatusForm(
  id: string,
  status: string,
): Promise<void> {
  await updateApplicationStatus(id, status);
}

export async function startApplication(
  opportunityId: string,
): Promise<{ ok?: boolean; applicationId?: string; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };
  const userId = session.user.id;

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { employer: true },
  });
  if (!opportunity) return { error: "Opportunity not found." };

  const existing = await prisma.application.findFirst({
    where: { userId, opportunityId },
    select: { id: true },
  });
  if (existing) return { ok: true, applicationId: existing.id };

  const created = await prisma.application.create({
    data: {
      userId,
      opportunityId,
      status: "DRAFT",
      source: "MANUAL",
      employerName: opportunity.employer.name,
      roleTitle: opportunity.title,
      // externalUrl is unique per [userId, externalUrl]; fall back to a
      // synthetic tracker URL when the opportunity has no application link.
      externalUrl: opportunity.applicationUrl ?? `tracker:${opportunityId}`,
    },
  });

  revalidatePath("/applications");
  return { ok: true, applicationId: created.id };
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

export async function startApplicationAndGo(opportunityId: string): Promise<never> {
  const res = await startApplication(opportunityId);
  if (!res.ok) throw new Error(res.error ?? "Could not start application");
  redirect("/applications");
}
