import { prisma } from "@/server/db";

export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isOverBudget(spent: number, limit: number): boolean {
  return spent >= limit;
}

export function dailyLimit(): number {
  const n = Number(process.env.CYCLOPS_DAILY_TOKEN_BUDGET ?? 2_000_000);
  return Number.isFinite(n) ? n : 2_000_000;
}

export async function checkBudget(userId: string): Promise<{ ok: boolean; spent: number }> {
  const usage = await prisma.dailyUsage.findUnique({
    where: { userId_day: { userId, day: dayKey() } },
  });
  const spent = usage?.tokens ?? 0;
  return { ok: !isOverBudget(spent, dailyLimit()), spent };
}

export async function recordUsage(userId: string, tokens: number): Promise<void> {
  const day = dayKey();
  await prisma.dailyUsage.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, tokens },
    update: { tokens: { increment: tokens } },
  });
}
