import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AppNav } from "@/components/app-nav";
import { CyclopsDock } from "@/components/dock/cyclops-dock";
import { getBadgeCounts } from "@/server/queries/attention";
import { prisma } from "@/server/db";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.onboarded) redirect("/onboarding");

  const today = new Date().toISOString().slice(0, 10);
  const [badges, brief] = await Promise.all([
    getBadgeCounts(session.user.id),
    prisma.attentionItem
      .findUnique({
        where: { userId_key: { userId: session.user.id, key: `brief:${today}` } },
        select: { status: true },
      })
      .catch(() => null), // Pre-SQL gate: table may not exist yet.
  ]);
  const activity = !brief
    ? "idle"
    : brief.status === "OPEN"
      ? "worked overnight"
      : "worked overnight · read";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav
        name={session.user.name ?? "You"}
        badges={badges}
        activity={activity}
      />
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">{children}</main>
        <CyclopsDock badge={badges.today} />
      </div>
    </div>
  );
}
