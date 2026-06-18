import type { NormalizedOpportunity, RawOpportunity } from "./types";
import { inferDeadline } from "./deadline-infer";
import { PROGRAMME_TYPE_LABELS } from "@/lib/constants";

function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Confidence reflects how complete/trustworthy the parsed record is. A future
 * scraper with partial data would score lower; our curated dataset scores high.
 */
function computeConfidence(raw: RawOpportunity): number {
  let score = 0.5;
  if (raw.status && raw.status !== "UNKNOWN") score += 0.15;
  if (raw.deadlineAt) score += 0.1;
  if (raw.opensAt) score += 0.05;
  if (raw.applicationUrl) score += 0.1;
  if (raw.eligibilityNotes || raw.sponsorshipInfo) score += 0.05;
  if (raw.tags && raw.tags.length > 0) score += 0.05;
  return Math.min(1, Math.round(score * 100) / 100);
}

export function normalizeOpportunity(
  raw: RawOpportunity,
  now: Date,
): NormalizedOpportunity {
  const realDeadline = parseDate(raw.deadlineAt);
  // No published deadline → infer one from the cycle. Today `isRolling` tracks
  // exactly this inferred case; a published deadline that is itself rolling
  // can't yet be flagged independently (no signal for it in RawOpportunity).
  const inferred = realDeadline ? null : inferDeadline(parseDate(raw.firstSeen) ?? now);
  // Programme season comes from classification (carried on RawOpportunity).
  // Seed/manual datasets omit it → default to SUMMER_INTERNSHIP. The tracker is
  // UK-only (ADR-005) so country/isUkBased are constant UK/true. Legacy
  // string/boolean fields are DERIVED so nothing downstream breaks while they
  // remain (retired in a later cycle).
  const programmeTypeEnum = raw.programmeType ?? "SUMMER_INTERNSHIP";
  return {
    employer: raw.employer.trim(),
    title: raw.title.trim(),
    programmeType: PROGRAMME_TYPE_LABELS[programmeTypeEnum],
    programmeTypeEnum,
    roleFamily: raw.roleFamily,
    divisionDesk: raw.divisionDesk?.trim() || null,
    location: raw.location.trim(),
    country: "UK",
    isUkBased: true,
    isSummerInternship: programmeTypeEnum === "SUMMER_INTERNSHIP",
    status: raw.status,
    opensAt: parseDate(raw.opensAt),
    deadlineAt: realDeadline ?? inferred!.deadlineAt,
    firstSeenAt: parseDate(raw.firstSeen) ?? now,
    lastSeenAt: parseDate(raw.lastSeen) ?? now,
    descriptionSummary: raw.summary.trim(),
    eligibilityNotes: raw.eligibilityNotes?.trim() || null,
    sponsorshipInfo: raw.sponsorshipInfo?.trim() || null,
    applicationUrl: raw.applicationUrl?.trim() || null,
    sourceUrl: raw.sourceUrl?.trim() || null,
    sourceType: raw.sourceType ?? "MANUAL",
    tags: (raw.tags ?? []).map((t) => t.trim()).filter(Boolean),
    deadlineEstimated: inferred !== null,
    isRolling: inferred !== null,
    confidence: computeConfidence(raw),
  };
}

export function normalizeAll(
  raws: RawOpportunity[],
  now: Date,
): NormalizedOpportunity[] {
  return raws.map((r) => normalizeOpportunity(r, now));
}
