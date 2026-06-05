import { prisma } from "./db";
import {
  scoreOpportunity,
  type ScoreOpportunity,
  type ScorePreferences,
  type ScoreProfile,
} from "../lib/scoring";

/**
 * Recompute and cache MatchScore rows for a user across every opportunity.
 * Called when onboarding finishes and whenever preferences/profile change.
 * Returns the number of scores written. No-op (returns 0) if the user hasn't
 * completed onboarding yet.
 */
export async function recomputeMatchScores(userId: string): Promise<number> {
  const [profile, prefs, opportunities] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.preferences.findUnique({ where: { userId } }),
    prisma.opportunity.findMany({
      include: { employer: { select: { name: true } }, tags: true },
    }),
  ]);

  if (!profile || !prefs) return 0;

  const scoreProfile: ScoreProfile = {
    workAuth: profile.workAuth,
    graduationYear: profile.graduationYear,
    currentYear: profile.currentYear,
    skills: profile.skills,
  };
  const scorePrefs: ScorePreferences = {
    targetRoleFamilies: prefs.targetRoleFamilies,
    preferredLocations: prefs.preferredLocations,
    openToAnywhereUk: prefs.openToAnywhereUk,
    targetEmployers: prefs.targetEmployers,
  };

  await prisma.$transaction(
    opportunities.map((opp) => {
      const scoreInput: ScoreOpportunity = {
        roleFamily: opp.roleFamily,
        location: opp.location,
        employerName: opp.employer.name,
        sponsorshipInfo: opp.sponsorshipInfo,
        eligibilityNotes: opp.eligibilityNotes,
        tags: opp.tags.map((t) => t.label),
        title: opp.title,
      };
      const { score, reasons } = scoreOpportunity(
        scoreProfile,
        scorePrefs,
        scoreInput,
      );
      return prisma.matchScore.upsert({
        where: {
          userId_opportunityId: { userId, opportunityId: opp.id },
        },
        update: { score, reasons, computedAt: new Date() },
        create: { userId, opportunityId: opp.id, score, reasons },
      });
    }),
  );

  return opportunities.length;
}
