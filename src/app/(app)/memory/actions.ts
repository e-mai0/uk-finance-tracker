"use server";

import { auth } from "@/server/auth";
import { memoryService } from "@/server/memory/service";
import { revalidatePath } from "next/cache";

const MAX_CONTENT_BYTES = 50_000;

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

export async function saveMemoryFile(
  path: string,
  content: string,
): Promise<void> {
  if (content.length > MAX_CONTENT_BYTES) {
    throw new Error(
      `Content exceeds ${MAX_CONTENT_BYTES.toLocaleString()} character limit (got ${content.length.toLocaleString()}).`,
    );
  }
  const userId = await requireUserId();
  try {
    await memoryService.write(userId, path, content, "USER", "edited on memory page");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("invalid memory path")) {
      throw new Error(`Invalid file path: "${path}". Only lowercase .md files are allowed.`);
    }
    throw new Error(`Could not save file: ${msg}`);
  }
  revalidatePath("/memory");
}

export async function revertMemoryRevision(
  revisionId: string,
): Promise<void> {
  const userId = await requireUserId();
  try {
    await memoryService.revert(userId, revisionId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "revision not found" || msg === "not your revision") {
      throw new Error("Could not restore: revision not found or access denied.");
    }
    throw new Error(`Could not restore revision: ${msg}`);
  }
  revalidatePath("/memory");
}
