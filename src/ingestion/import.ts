import type { PrismaClient } from "@prisma/client";
import type { RawDataset } from "./types";
import { normalizeAll } from "./normalize";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface ImportResult {
  created: number;
  updated: number;
  employers: number;
}

/**
 * Upsert pipeline: employers → opportunities → tags/sources, wrapped in an
 * IngestionRun record. Idempotent — re-running updates existing rows rather
 * than duplicating. This is the seam future ATS adapters write through.
 */
export async function importDataset(
  prisma: PrismaClient,
  dataset: RawDataset,
  now: Date = new Date(),
): Promise<ImportResult> {
  const run = await prisma.ingestionRun.create({
    data: { source: dataset.source, startedAt: now },
  });

  let created = 0;
  let updated = 0;

  // 1. Employers ------------------------------------------------------------
  const employerIdByName = new Map<string, string>();
  for (const e of dataset.employers) {
    const employer = await prisma.employer.upsert({
      where: { name: e.name },
      update: {
        sector: e.sector ?? null,
        hq: e.hq ?? null,
        website: e.website ?? null,
        logoHint: e.logoHint ?? null,
      },
      create: {
        name: e.name,
        slug: slugify(e.name),
        sector: e.sector ?? null,
        hq: e.hq ?? null,
        website: e.website ?? null,
        logoHint: e.logoHint ?? null,
      },
    });
    employerIdByName.set(e.name, employer.id);
  }

  // 2. Opportunities --------------------------------------------------------
  const normalized = normalizeAll(dataset.opportunities, now);
  for (const n of normalized) {
    const employerId = employerIdByName.get(n.employer);
    if (!employerId) {
      throw new Error(
        `Opportunity "${n.title}" references unknown employer "${n.employer}".`,
      );
    }

    const existing = await prisma.opportunity.findUnique({
      where: {
        employerId_title_location: {
          employerId,
          title: n.title,
          location: n.location,
        },
      },
      select: { id: true, firstSeenAt: true },
    });

    const data = {
      employerId,
      title: n.title,
      programmeType: n.programmeType,
      roleFamily: n.roleFamily,
      divisionDesk: n.divisionDesk,
      location: n.location,
      country: n.country,
      isUkBased: n.isUkBased,
      isSummerInternship: n.isSummerInternship,
      applicationUrl: n.applicationUrl,
      sourceUrl: n.sourceUrl,
      sourceType: n.sourceType,
      status: n.status,
      opensAt: n.opensAt,
      deadlineAt: n.deadlineAt,
      descriptionSummary: n.descriptionSummary,
      eligibilityNotes: n.eligibilityNotes,
      sponsorshipInfo: n.sponsorshipInfo,
      confidence: n.confidence,
      lastSeenAt: n.lastSeenAt,
    };

    let opportunityId: string;
    if (existing) {
      await prisma.opportunity.update({
        where: { id: existing.id },
        data, // keep original firstSeenAt
      });
      opportunityId = existing.id;
      updated++;
    } else {
      const opp = await prisma.opportunity.create({
        data: { ...data, firstSeenAt: n.firstSeenAt },
      });
      opportunityId = opp.id;
      created++;
    }

    // Replace tags + sources for a clean, idempotent state.
    await prisma.opportunityTag.deleteMany({ where: { opportunityId } });
    if (n.tags.length > 0) {
      await prisma.opportunityTag.createMany({
        data: n.tags.map((label) => ({ opportunityId, label })),
      });
    }

    await prisma.opportunitySource.deleteMany({ where: { opportunityId } });
    const sources = [
      n.applicationUrl
        ? { sourceType: n.sourceType, url: n.applicationUrl, label: "Apply" }
        : null,
      n.sourceUrl
        ? { sourceType: n.sourceType, url: n.sourceUrl, label: "Source" }
        : null,
    ].filter(Boolean) as {
      sourceType: typeof n.sourceType;
      url: string;
      label: string;
    }[];
    if (sources.length > 0) {
      await prisma.opportunitySource.createMany({
        data: sources.map((s) => ({ ...s, opportunityId })),
      });
    }
  }

  await prisma.ingestionRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      created,
      updated,
      notes: `${dataset.employers.length} employers, ${normalized.length} opportunities`,
    },
  });

  return { created, updated, employers: dataset.employers.length };
}
