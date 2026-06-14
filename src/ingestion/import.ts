import type { PrismaClient } from "@prisma/client";
import type { RawDataset } from "./types";
import { normalizeAll } from "./normalize";
import { decideTransitions } from "./status";

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
      deadlineEstimated: n.deadlineEstimated,
      isRolling: n.isRolling,
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

  // Health-gated close sweep: for each employer+sourceType cohort touched this
  // run, mark roles absent from this (healthy) feed as missed/closed, reopen
  // reappearances, and close roles past a REAL deadline. `healthy` is true here
  // because importDataset only runs after a successful adapter fetch.
  //
  // INVARIANT: at most one ENABLED source per (employer, sourceType). The seed
  // enforces this by picking a single feed per firm (e.g. Citi→Eightfold only,
  // Barclays→Workday only — see prisma/seed.ts dedupe rules). If that invariant
  // is ever broken, two sources of the same kind would treat each other's roles
  // as "absent" and flap them OPEN/CLOSED. The robust fix if multi-source-per-
  // type becomes real is to scope the cohort to the originating source id
  // (would require persisting ingestionSourceId on Opportunity).
  const presentByCohort = new Map<string, Set<string>>(); // `${employerId}:${sourceType}` -> keys
  for (const n of normalized) {
    const employerId = employerIdByName.get(n.employer)!;
    const cohort = `${employerId}:${n.sourceType}`;
    const key = `${n.title} ${n.location}`;
    let set = presentByCohort.get(cohort);
    if (!set) { set = new Set(); presentByCohort.set(cohort, set); }
    set.add(key);
  }
  for (const [cohort, presentKeys] of presentByCohort) {
    const sep = cohort.indexOf(":");
    const employerId = cohort.slice(0, sep);
    const sourceType = cohort.slice(sep + 1) as (typeof normalized)[number]["sourceType"];
    const rows = await prisma.opportunity.findMany({
      where: { employerId, sourceType },
      select: { id: true, title: true, location: true, status: true, consecutiveMisses: true, deadlineAt: true, deadlineEstimated: true },
    });
    const existing = rows.map((r) => ({
      key: `${r.title} ${r.location}`,
      status: r.status,
      consecutiveMisses: r.consecutiveMisses,
      deadlineAt: r.deadlineAt,
      deadlineEstimated: r.deadlineEstimated,
    }));
    const idByKey = new Map(rows.map((r) => [`${r.title} ${r.location}`, r.id]));
    const transitions = decideTransitions(existing, presentKeys, true, now);
    for (const t of transitions) {
      await prisma.opportunity.update({
        where: { id: idByKey.get(t.key)! },
        data: {
          status: t.status,
          consecutiveMisses: t.consecutiveMisses,
          ...(t.status === "CLOSED" ? { closedAt: now, closeReason: t.closeReason } : { closedAt: null, closeReason: null }),
        },
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
