import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AppNav } from "@/components/app-nav";
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

  const badges = await getBadgeCounts(session.user.id);

  // "worked overnight" while today's brief is still unread; otherwise idle.
  let activity = "idle";
  try {
    const today = new Date().toISOString().slice(0, 10);
    const brief = await prisma.attentionItem.findUnique({
      where: { userId_key: { userId: session.user.id, key: `brief:${today}` } },
      select: { status: true },
    });
    if (brief) activity = brief.status === "OPEN" ? "worked overnight" : "worked overnight · read";
  } catch (_e) {
    // Pre-SQL gate: table may not exist yet.
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav
        name={session.user.name ?? "You"}
        badges={badges}
        activity={activity}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
