import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.onboarded) redirect("/onboarding");

  // Badge counts become live views over the attention store in Plan 2 (Phase C).
  const badges = { today: 0, applications: 0, chat: 0 };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav
        name={session.user.name ?? "You"}
        badges={badges}
        activity="idle"
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
