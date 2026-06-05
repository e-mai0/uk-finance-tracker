import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { SettingsForm } from "@/components/settings/settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Trackr" };

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, profile, prefs, employers] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.preferences.findUnique({ where: { userId } }),
    prisma.employer.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);

  // Onboarding guarantees these exist; guard defensively.
  if (!user || !profile || !prefs) redirect("/onboarding");

  const grade = (profile.gradeInfo ?? {}) as {
    aLevels?: string;
    gcseSummary?: string;
    gpaOrEquivalent?: string;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">
          Update your profile and preferences. Saving recalculates your fit
          scores across every role.
        </p>
      </div>

      <SettingsForm
        employerSuggestions={employers.map((e) => e.name)}
        initial={{
          name: user.name,
          email: user.email,
          university: profile.university,
          degreeSubject: profile.degreeSubject,
          degreeType: profile.degreeType,
          graduationYear: profile.graduationYear,
          currentYear: profile.currentYear,
          targetRoleFamilies: prefs.targetRoleFamilies,
          skills: profile.skills,
          workAuth: profile.workAuth,
          aLevels: grade.aLevels ?? "",
          gcseSummary: grade.gcseSummary ?? "",
          gpaOrEquivalent: grade.gpaOrEquivalent ?? "",
          preferredLocations: prefs.preferredLocations,
          openToAnywhereUk: prefs.openToAnywhereUk,
          targetEmployers: prefs.targetEmployers,
        }}
      />
    </div>
  );
}
