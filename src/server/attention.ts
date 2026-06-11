import { prisma } from "@/server/db";
import type { AttentionKind, Prisma } from "@prisma/client";

type UpsertArgs = {
  userId: string;
  kind: AttentionKind;
  key: string;
  targetType: string;
  targetId: string;
  title: string;
  meta?: Record<string, unknown>;
};

let warnedUnavailable = false;
function warnOnce(err: unknown): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn(
    "[attention] table unavailable — apply prisma/sql/2026-06-11-attention-items.sql",
    err,
  );
}

/**
 * Idempotent write: cron re-runs update the same row instead of duplicating.
 * All writes no-op until the user applies the attention-items SQL.
 */
export async function upsertAttention(args: UpsertArgs): Promise<void> {
  try {
    await prisma.attentionItem.upsert({
      where: { userId_key: { userId: args.userId, key: args.key } },
      create: {
        userId: args.userId,
        kind: args.kind,
        key: args.key,
        targetType: args.targetType,
        targetId: args.targetId,
        title: args.title,
        meta: args.meta as Prisma.InputJsonValue | undefined,
      },
      update: {
        title: args.title,
        meta: args.meta as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (e) {
    warnOnce(e);
  }
}

export async function resolveAttentionByKey(userId: string, key: string): Promise<void> {
  try {
    await prisma.attentionItem.updateMany({
      where: { userId, key, status: { not: "RESOLVED" } },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  } catch (e) {
    warnOnce(e);
  }
}

export async function resolveAttentionByTarget(
  userId: string,
  targetType: string,
  targetId: string,
): Promise<void> {
  try {
    await prisma.attentionItem.updateMany({
      where: { userId, targetType, targetId, status: { not: "RESOLVED" } },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  } catch (e) {
    warnOnce(e);
  }
}
