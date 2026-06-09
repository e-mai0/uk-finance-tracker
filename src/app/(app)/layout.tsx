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
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader name={session.user.name ?? "You"} savedCount={savedCount} />
      {/* Full-bleed shell — data pages fill the viewport edge-to-edge like a
          real terminal; content/form pages supply their own padded container. */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
