import { prisma } from "@/server/db";

export type NavBadgeCounts = { today: number; applications: number; chat: number };

export type OpenAttention = {
  kind: "PROPOSAL" | "FLAG" | "QUESTION" | "BRIEF";
  title: string;
  targetType: string;
  targetId: string;
};

const APPLICATION_TARGET_TYPES = new Set(["application", "draft"]);

const ZERO: NavBadgeCounts = { today: 0, applications: 0, chat: 0 };

let warnedUnavailable = false;
function warnOnce(err: unknown): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn(
    "[attention] table unavailable — apply prisma/sql/2026-06-11-attention-items.sql",
    err,
  );
}

/** Spec §4.3: every badge is a filtered count over OPEN attention items. */
export async function getBadgeCounts(userId: string): Promise<NavBadgeCounts> {
  try {
    const open = await prisma.attentionItem.findMany({
      where: { userId, status: "OPEN" },
      select: { targetType: true, targetId: true },
    });
    let applications = 0;
    const chatSessions = new Set<string>();
    for (const item of open) {
      if (APPLICATION_TARGET_TYPES.has(item.targetType)) applications++;
      if (item.targetType === "chat-session") chatSessions.add(item.targetId);
    }
    return { today: open.length, applications, chat: chatSessions.size };
  } catch (_e) {
    // Table absent until the user applies prisma/sql/2026-06-11-attention-items.sql.
    warnOnce(_e);
    return ZERO;
  }
}

/** Open items grouped by targetId for one targetType (tracker row tags). */
export async function getOpenAttentionByTarget(
  userId: string,
  targetType: string,
): Promise<Map<string, OpenAttention[]>> {
  const map = new Map<string, OpenAttention[]>();
  try {
    const open = await prisma.attentionItem.findMany({
      where: { userId, status: "OPEN", targetType },
      select: { kind: true, title: true, targetType: true, targetId: true },
    });
    for (const item of open) {
      const list = map.get(item.targetId) ?? [];
      list.push(item as OpenAttention);
      map.set(item.targetId, list);
    }
  } catch (_e) {
    // Pre-SQL gate: no tags.
    warnOnce(_e);
  }
  return map;
}
