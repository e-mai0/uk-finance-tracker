"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db";
import { mintToken } from "../ext-auth";

export interface ConnectResult {
  ok?: boolean;
  error?: string;
  token?: string; // one-time plaintext, shown once
}

/** Mint a new extension token. The plaintext is returned ONCE. */
export async function connectExtension(): Promise<ConnectResult> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };

  const { token } = await mintToken(session.user.id, "Browser extension");
  revalidatePath("/settings");
  return { ok: true, token };
}

/** Revoke a token by id (must belong to the current user). */
export async function revokeToken(id: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Your session has expired. Sign in again." };

  await prisma.apiToken.updateMany({
    where: { id, userId: session.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings");
  return { ok: true };
}
