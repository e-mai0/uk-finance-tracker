import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings/settings-form";
import { QuestionnaireForm } from "@/components/questionnaire/questionnaire-form";
import { ApplyProfileForm } from "@/components/settings/apply-profile-form";
import { AnswerBankManager } from "@/components/settings/answer-bank-manager";
import { ExtensionConnect } from "@/components/settings/extension-connect";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Trackr" };

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);

/**
 * Static, code-verified product facts — what Cyclops may do and where the
 * hard limits sit. Each meta sentence is checked against the implementation:
 * drafting saves only on an explicit user action (save flag in
 * src/app/api/ext/answer/route.ts, sent by the panel's Save/Accept buttons);
 * the overnight sweep is a 05:30 cron with per-user budget gates and a global
 * refresh cap (src/app/api/cron/overnight/route.ts); the extension fills only
 * after the user clicks the cue and never touches a submit button
 * (extension/src/content/panel.ts: "Trackr never submits for you").
 */
const PERMISSIONS: { title: string; meta: string; chip: "on" | "you" }[] = [
  {
    title: "Draft answers in your voice",
    meta: "USES ANSWER BANK + CV · SAVES ONLY WHEN YOU APPROVE",
    chip: "on",
  },
  {
    title: "Overnight listing refresh & morning brief",
    meta: "NIGHTLY CRON 05:30 · BUDGET-CAPPED",
    chip: "on",
  },
  {
    title: "Fill forms via the extension",
    meta: "ONLY WITH YOU WATCHING · CONFIRMATION-GATED · NEVER SUBMITS",
    chip: "on",
  },
  {
    title: "Submit applications",
    meta: "NEVER AUTOMATIC — THIS CANNOT BE ENABLED",
    chip: "you",
  },
];

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
    <div className="mx-auto max-w-3xl space-y-5 px-5 py-8">
      <div>
        <p className="label text-faint">Config</p>
        <h1 className="mt-1 text-[1.75rem] text-ink">Settings</h1>
        <p className="mt-1 text-[0.875rem] text-muted">
          Update your profile and preferences. Saving recalculates your fit
          scores across every role.
        </p>
      </div>

      {/* Cyclops permissions — sentences, not toggles. The submit row is a
          bedrock fact (ink chip), not a setting that could ever flip. */}
      <section className="rounded-card border border-border bg-surface shadow-card">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-[1rem] font-semibold text-ink">
            Cyclops permissions
          </h2>
          <span className="label text-faint">WHAT THE AGENT MAY DO</span>
        </div>
        <ul className="divide-y divide-hairline">
          {PERMISSIONS.map((p) => (
            <li key={p.title} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] font-bold text-ink">{p.title}</p>
                <p className="label mt-0.5 text-subtle">{p.meta}</p>
              </div>
              {p.chip === "on" ? (
                <span className="label shrink-0 rounded-pill bg-success-soft px-2.5 py-0.5 text-success">
                  ✓ ON
                </span>
              ) : (
                <span className="label shrink-0 rounded-pill bg-ink px-2.5 py-0.5 text-canvas">
                  ALWAYS YOU
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <SettingsForm
        initial={{
          name: user.name,
          email: user.email,
          university: profile.university,
          degreeSubject: profile.degreeSubject,
          degreeType: profile.degreeType,
          graduationYear: profile.graduationYear,
          currentYear: profile.currentYear,
          targetRoleFamilies: prefs.targetRoleFamilies,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Questionnaire</CardTitle>
          <p className="mt-0.5 text-xs text-muted">
            Optional details that sharpen your matches and drafts.
          </p>
        </CardHeader>
        <CardBody>
          <QuestionnaireForm
            variant="settings"
            employerSuggestions={employers.map((e) => e.name)}
            initial={{
              workAuth: profile.workAuth,
              aLevels: grade.aLevels ?? "",
              gcseSummary: grade.gcseSummary ?? "",
              gpaOrEquivalent: grade.gpaOrEquivalent ?? "",
              skills: profile.skills,
              preferredLocations: prefs.preferredLocations,
              openToAnywhereUk: prefs.openToAnywhereUk,
              targetEmployers: prefs.targetEmployers,
            }}
          />
        </CardBody>
      </Card>

      <div className="space-y-1.5 pt-2">
        <h2 className="text-[1.0625rem] leading-none text-ink">Apply copilot</h2>
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
