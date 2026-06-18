import { prisma } from "../db";
import type { TrackerItem } from "../../lib/filters";
import {
  scoreOpportunity,
  type ScoreOpportunity,
  type ScorePreferences,
  type ScoreProfile,
} from "../../lib/scoring";

/**
 * Load every opportunity as a flattened TrackerItem for a given user, enriched
 * with the user's cached match score and saved flag. Opportunities ingested
 * since the user's scores were last cached (live sources add rows at any time)
 * get their score computed on the fly so the tracker never shows a blank fit.
 * Filtering/sorting happens in-memory (dataset is small) via lib/filters so it
 * stays pure + testable.
 */
export async function getTrackerItems(userId: string): Promise<TrackerItem[]> {
  const [opportunities, scores, saved, profile, prefs] = await Promise.all([
    prisma.opportunity.findMany({
      include: { employer: true, tags: true },
    }),
    prisma.matchScore.findMany({
      where: { userId },
      select: { opportunityId: true, score: true },
    }),
    prisma.savedOpportunity.findMany({
      where: { userId },
      select: { opportunityId: true },
    }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.preferences.findUnique({ where: { userId } }),
  ]);

  const scoreMap = new Map(scores.map((s) => [s.opportunityId, s.score]));
  const savedSet = new Set(saved.map((s) => s.opportunityId));

  let scoreUncached: ((o: (typeof opportunities)[number]) => number) | null =
    null;
  if (profile && prefs) {
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
    scoreUncached = (o) => {
      const input: ScoreOpportunity = {
        roleFamily: o.roleFamily,
        location: o.location,
        employerName: o.employer.name,
        sponsorshipInfo: o.sponsorshipInfo,
        eligibilityNotes: o.eligibilityNotes,
        tags: o.tags.map((t) => t.label),
        title: o.title,
      };
      return scoreOpportunity(scoreProfile, scorePrefs, input).score;
    };
  }

  return opportunities.map((o) => ({
    id: o.id,
    employerName: o.employer.name,
    employerSlug: o.employer.slug,
    logoHint: o.employer.logoHint,
    title: o.title,
    roleFamily: o.roleFamily,
    programmeType: o.programmeTypeEnum,
    divisionDesk: o.divisionDesk,
    location: o.location,
    status: o.status,
    opensAt: o.opensAt,
    deadlineAt: o.deadlineAt,
    deadlineEstimated: o.deadlineEstimated,
    isRolling: o.isRolling,
    lastSeenAt: o.lastSeenAt,
    firstSeenAt: o.firstSeenAt,
    applicationUrl: o.applicationUrl,
    sponsorshipInfo: o.sponsorshipInfo,
    tags: o.tags.map((t) => t.label),
    score: scoreMap.get(o.id) ?? scoreUncached?.(o),
    saved: savedSet.has(o.id),
  }));
}

export interface OpportunityDetail {
  opportunity: NonNullable<Awaited<ReturnType<typeof loadDetail>>>;
  score: number | null;
  reasons: string[];
  saved: boolean;
  savedNotes: string | null;
}

function loadDetail(id: string) {
  return prisma.opportunity.findUnique({
    where: { id },
    include: { employer: true, tags: true, sources: true },
  });
}

/**
 * Detail for a single opportunity. Returns the cached score+reasons if present;
 * otherwise computes them live from the user's profile (e.g. a brand-new role
 * not yet in the cache) so the page never shows a blank fit.
 */
export async function getOpportunityDetail(
  id: string,
  userId: string,
): Promise<OpportunityDetail | null> {
  const opportunity = await loadDetail(id);
  if (!opportunity) return null;

  const [match, savedRow, profile, prefs] = await Promise.all([
    prisma.matchScore.findUnique({
      where: { userId_opportunityId: { userId, opportunityId: id } },
    }),
    prisma.savedOpportunity.findUnique({
      where: { userId_opportunityId: { userId, opportunityId: id } },
    }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.preferences.findUnique({ where: { userId } }),
  ]);

  let score: number | null = match?.score ?? null;
  let reasons: string[] = Array.isArray(match?.reasons)
    ? (match!.reasons as string[])
    : [];

  if (score === null && profile && prefs) {
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
    const input: ScoreOpportunity = {
      roleFamily: opportunity.roleFamily,
      location: opportunity.location,
      employerName: opportunity.employer.name,
      sponsorshipInfo: opportunity.sponsorshipInfo,
      eligibilityNotes: opportunity.eligibilityNotes,
      tags: opportunity.tags.map((t) => t.label),
      title: opportunity.title,
    };
    const computed = scoreOpportunity(scoreProfile, scorePrefs, input);
    score = computed.score;
    reasons = computed.reasons;
  }

  return {
    opportunity,
    score,
    reasons,
    saved: !!savedRow,
    savedNotes: savedRow?.notes ?? null,
  };
}

export async function getSavedItems(userId: string): Promise<TrackerItem[]> {
  const items = await getTrackerItems(userId);
  return items.filter((i) => i.saved);
}
