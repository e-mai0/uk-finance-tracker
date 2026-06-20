import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { Brand } from "@/components/brand";

export const metadata = { title: "Get started — Cyclops" };

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.onboarded) redirect("/today");

  const employers = await prisma.employer.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });
  const firstName = (session.user.name ?? "there").split(" ")[0];

  return (
    <div className="min-h-full">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-6">
        <Brand href="/" />
      </header>
      <div className="px-4 py-6 sm:py-10">
        <SessionProvider session={session}>
          <OnboardingWizard
            firstName={firstName}
            employerSuggestions={employers.map((e) => e.name)}
          />
        </SessionProvider>
      </div>
    </div>
  );
}
