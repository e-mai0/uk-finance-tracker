"use server";

import { auth } from "@/server/auth";
import { memoryService } from "@/server/memory/service";
import { revalidatePath } from "next/cache";

const MAX_CONTENT_CHARS = 50_000;

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

export async function saveMemoryFile(
  path: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Auth check first — unauthorized always throws (not a user-facing result)
  const userId = await requireUserId();

  if (content.length > MAX_CONTENT_CHARS) {
    return {
      ok: false,
      error: `Content exceeds ${MAX_CONTENT_CHARS.toLocaleString()} character limit (got ${content.length.toLocaleString()}).`,
    };
  }

  try {
    await memoryService.write(userId, path, content, "USER", "edited on memory page");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("invalid memory path")) {
      return {
        ok: false,
        error: `Invalid file path: "${path}". Only lowercase .md files are allowed.`,
      };
    }
    throw err;
  }

  revalidatePath("/memory");
  return { ok: true };
}

export async function revertMemoryRevision(
  revisionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Auth check first — unauthorized always throws
  const userId = await requireUserId();

  try {
    await memoryService.revert(userId, revisionId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "revision not found" || msg === "not your revision") {
      return {
        ok: false,
        error: "Could not restore: revision not found or access denied.",
      };
    }
    throw err;
  }

  revalidatePath("/memory");
  return { ok: true };
}
