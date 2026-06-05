import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppHeader } from "@/components/app-header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.onboarded) redirect("/onboarding");

  const savedCount = await prisma.savedOpportunity.count({
    where: { userId: session.user.id },
  });

  return (
    <div className="min-h-full">
      <AppHeader name={session.user.name ?? "You"} savedCount={savedCount} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
