import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { SettingsForm } from "@/components/settings/settings-form";
import { ApplyProfileForm } from "@/components/settings/apply-profile-form";
import { AnswerBankManager } from "@/components/settings/answer-bank-manager";
import { ExtensionConnect } from "@/components/settings/extension-connect";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Trackr" };

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, profile, prefs, employers, applyProfile, answers, tokens] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.profile.findUnique({ where: { userId } }),
      prisma.preferences.findUnique({ where: { userId } }),
      prisma.employer.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
      prisma.applyProfile.findUnique({ where: { userId } }),
      prisma.answerBankItem.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.apiToken.findMany({
        where: { userId, revokedAt: null },
        orderBy: { createdAt: "desc" },
      }),
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

      <div className="space-y-1.5 pt-2">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Apply copilot</h2>
        <p className="text-sm text-muted">
          Set up the autofill extension and the details it uses on application forms.
        </p>
      </div>

      <ApplyProfileForm
        initial={{
          phone: applyProfile?.phone ?? "",
          addressCity: applyProfile?.addressCity ?? "",
          country: applyProfile?.country ?? "United Kingdom",
          linkedinUrl: applyProfile?.linkedinUrl ?? "",
          githubUrl: applyProfile?.githubUrl ?? "",
          websiteUrl: applyProfile?.websiteUrl ?? "",
          pronouns: applyProfile?.pronouns ?? "",
          noticePeriod: applyProfile?.noticePeriod ?? "",
          earliestStart: applyProfile?.earliestStart ?? "",
          workAuthStatement: applyProfile?.workAuthStatement ?? "",
          sponsorshipStatement: applyProfile?.sponsorshipStatement ?? "",
          selfIdGender: applyProfile?.selfIdGender ?? "",
          selfIdEthnicity: applyProfile?.selfIdEthnicity ?? "",
          cvFileName: applyProfile?.cvFileName ?? null,
          cvFileSize: applyProfile?.cvFileSize ?? null,
          cvHasText: Boolean(applyProfile?.cvText),
          cvStored: Boolean(applyProfile?.cvStoragePath),
        }}
      />

      <AnswerBankManager
        items={answers.map((a) => ({
          id: a.id,
          questionText: a.questionText,
          answer: a.answer,
          employer: a.employer,
          usageCount: a.usageCount,
        }))}
      />

      <ExtensionConnect
        tokens={tokens.map((t) => ({
          id: t.id,
          name: t.name,
          createdAt: fmtDate(t.createdAt),
          lastUsedAt: t.lastUsedAt ? fmtDate(t.lastUsedAt) : null,
        }))}
      />
    </div>
  );
}
