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
    degreeSubject: profile.degreeSubject,
  };
  const scorePrefs: ScorePreferences = {
    targetRoleFamilies: prefs.targetRoleFamilies,
    preferredLocations: prefs.preferredLocations,
    openToAnywhereUk: prefs.openToAnywhereUk,
    targetEmployers: prefs.targetEmployers,
  };

  const rows = opportunities.map((opp) => {
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
    return { userId, opportunityId: opp.id, score, reasons };
  });

  // Replace the user's cached scores in one transaction of two statements,
  // rather than one upsert per opportunity. The old per-row fan-out held a
  // transaction open across N round-trips on a small connection pool, which is
  // what tripped P2024 ("Timed out fetching a connection from the pool") once
  // the live-ingested dataset grew. deleteMany + createMany is two round-trips
  // regardless of how many opportunities exist.
  await prisma.$transaction([
    prisma.matchScore.deleteMany({ where: { userId } }),
    prisma.matchScore.createMany({ data: rows, skipDuplicates: true }),
  ]);

  return opportunities.length;
}
